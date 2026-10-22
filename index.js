require('dotenv').config({ override: false });
/**
 * WhatsApp MD Bot - Main Entry Point
 */
process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
initializeTempSystem();
startCleanup();

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const forbiddenPatternsConsole = [
  'closing session',
  'closing open session',
  'sessionentry',
  'prekey bundle',
  'pendingprekey',
  '_chains',
  'registrationid',
  'currentratchet',
  'chainkey',
  'ratchet',
  'signal protocol',
  'ephemeralkeypair',
  'indexinfo',
  'basekey'
];

console.log = (...args) => {
  const message = args.map(a =>
    typeof a === 'string'
      ? a
      : typeof a === 'object'
        ? JSON.stringify(a)
        : String(a)
  ).join(' ').toLowerCase();

  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleLog.apply(console, args);
  }
};

console.error = (...args) => {
  const message = args.map(a =>
    typeof a === 'string'
      ? a
      : typeof a === 'object'
        ? JSON.stringify(a)
        : String(a)
  ).join(' ').toLowerCase();

  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleError.apply(console, args);
  }
};

console.warn = (...args) => {
  const message = args.map(a =>
    typeof a === 'string'
      ? a
      : typeof a === 'object'
        ? JSON.stringify(a)
        : String(a)
  ).join(' ').toLowerCase();

  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleWarn.apply(console, args);
  }
};

// Now safe to load libraries
const pino = require('pino');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const config = require('./config');
const handler = require('./handler');
const {
  getRevokeInfo,
  notifyDeletedMessage
} = require('./utils/deleteAudit');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const { spawn } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// Remove Puppeteer cache
function cleanupPuppeteerCache() {
  try {
    const home = os.homedir();
    const cacheDir = path.join(home, '.cache', 'puppeteer');

    if (fs.existsSync(cacheDir)) {
      console.log('Removing Puppeteer cache at:', cacheDir);
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('Puppeteer cache removed');
    }
  } catch (err) {
    console.error('Failed to cleanup Puppeteer cache:', err.message || err);
  }
}

// Optimized in-memory store
const store = {
  messages: new Map(),
  maxPerChat: 200,

  bind: (ev) => {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id || getRevokeInfo(msg)) continue;

        const jid = msg.key.remoteJid;

        if (!store.messages.has(jid)) {
          store.messages.set(jid, new Map());
        }

        const chatMsgs = store.messages.get(jid);
        chatMsgs.set(msg.key.id, msg);

        if (chatMsgs.size > store.maxPerChat) {
          const oldestKey = chatMsgs.keys().next().value;
          chatMsgs.delete(oldestKey);
        }
      }
    });
  },

  loadMessage: async (jid, id) => {
    return store.messages.get(jid)?.get(id) || null;
  }
};

// Message deduplication
const processedMessages = new Set();

setInterval(() => {
  processedMessages.clear();
}, 5 * 60 * 1000);

// Custom Pino logger with suppression
const createSuppressedLogger = (level = 'silent') => {
  const forbiddenPatterns = [
    'closing session',
    'closing open session',
    'sessionentry',
    'prekey bundle',
    'pendingprekey',
    '_chains',
    'registrationid',
    'currentratchet',
    'chainkey',
    'ratchet',
    'signal protocol',
    'ephemeralkeypair',
    'indexinfo',
    'basekey',
    'ratchetkey'
  ];

  let logger;

  try {
    logger = pino({
      level,
      transport: process.env.NODE_ENV === 'production'
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              ignore: 'pid,hostname'
            }
          },
      customLevels: {
        trace: 0,
        debug: 1,
        info: 2,
        warn: 3,
        error: 4,
        fatal: 5
      },
      redact: [
        'registrationId',
        'ephemeralKeyPair',
        'rootKey',
        'chainKey',
        'baseKey'
      ]
    });
  } catch (err) {
    logger = pino({ level });
  }

  const originalInfo = logger.info.bind(logger);

  logger.info = (...args) => {
    const msg = args.map(a =>
      typeof a === 'string' ? a : JSON.stringify(a)
    ).join(' ').toLowerCase();

    if (!forbiddenPatterns.some(pattern => msg.includes(pattern))) {
      originalInfo(...args);
    }
  };

  logger.debug = () => {};
  logger.trace = () => {};

  return logger;
};

// Main connection function
async function startBot() {
  const sessionFolder = path.join(__dirname, config.sessionName);
  const sessionFile = path.join(sessionFolder, 'creds.json');

  // Check if sessionID is provided
  if (config.sessionID && config.sessionID.startsWith('KnightBot!')) {
    try {
      const [header, b64data] = config.sessionID.split('!');

      if (header !== 'KnightBot' || !b64data) {
        throw new Error(
          "Invalid session format. Expected 'KnightBot!.....'"
        );
      }

      const cleanB64 = b64data.replace('...', '');
      const compressedData = Buffer.from(cleanB64, 'base64');
      const decompressedData = zlib.gunzipSync(compressedData);

      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
      }

      fs.writeFileSync(sessionFile, decompressedData, 'utf8');
      console.log('Session retrieved from KnightBot Session');
    } catch (e) {
      console.error(
        'Error processing KnightBot session:',
        e.message
      );
    }
  }

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionFolder);

  const { version } = await fetchLatestBaileysVersion();

  const suppressedLogger = createSuppressedLogger('silent');

  /*
   * PAIRING CODE CONFIGURATION
   *
   * Set PAIRING_NUMBER in your hosting environment.
   * Example Sri Lankan number: 9477XXXXXXX
   *
   * Use country code + number, digits only.
   * Do not include +, spaces, or hyphens.
   *
   * If PAIRING_NUMBER is missing or invalid, QR login remains available.
   */

  const pairingNumberRaw =
    String(process.env.PAIRING_NUMBER || '').trim();

  const pairingNumber =
    pairingNumberRaw.replace(/\D/g, '');

  const pairingNumberValid =
    /^\d{8,15}$/.test(pairingNumber);

  const pairingMode =
    pairingNumberRaw.length > 0 &&
    pairingNumberValid &&
    !state.creds.registered;

  if (pairingNumberRaw && !pairingNumberValid) {
    console.error(
      '[PAIRING] PAIRING_NUMBER is invalid. Use international format, digits only. Example: 9477XXXXXXX'
    );
    console.error(
      '[PAIRING] QR login will remain enabled until you correct PAIRING_NUMBER.'
    );
  }

  if (
    pairingNumberRaw &&
    pairingNumberValid &&
    state.creds.registered
  ) {
    console.log(
      '[PAIRING] Existing registered session found. Reusing saved session.'
    );
  }

  const sock = makeWASocket({
    version,
    logger: suppressedLogger,
    printQRInTerminal: false,
    browser: ['Chrome', 'Windows', '10.0'],
    auth: state,
    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => undefined
  });

  /*
   * Request the pairing code once per socket startup.
   * The delay gives the socket time to initialize.
   */
  if (pairingMode) {
    let pairingCodeRequested = false;

    setTimeout(async () => {
      if (pairingCodeRequested) return;

      pairingCodeRequested = true;

      try {
        if (typeof sock.requestPairingCode !== 'function') {
          throw new Error(
            'This Baileys version does not expose requestPairingCode(). Check the installed @whiskeysockets/baileys version.'
          );
        }

        const code =
          await sock.requestPairingCode(pairingNumber);

        console.log('\n========================================');
        console.log(' WhatsApp PHONE-NUMBER PAIRING CODE');
        console.log('========================================');
        console.log(`\n  ${code}\n`);
        console.log('On your phone:');
        console.log('1. Open WhatsApp.');
        console.log('2. Go to Linked devices.');
        console.log('3. Select Link a device.');
        console.log('4. Select Link with phone number instead.');
        console.log('5. Enter the code shown above.');
        console.log('\nDo not share this code with anyone.');
        console.log('========================================\n');
      } catch (err) {
        console.error(
          '[PAIRING] Could not request pairing code:',
          err?.message || err
        );

        console.error(
          '[PAIRING] Check PAIRING_NUMBER, the installed Baileys version, and whether this account can link another device.'
        );
      }
    }, 1500);
  }

  // Bind store to socket
  store.bind(sock.ev);

  // Watchdog for inactive socket
  let lastActivity = Date.now();
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

  sock.ev.on('messages.upsert', () => {
    lastActivity = Date.now();
  });

  const watchdogInterval = setInterval(async () => {
    if (
      Date.now() - lastActivity > INACTIVITY_TIMEOUT &&
      sock.ws.readyState === 1
    ) {
      console.log(
        'No activity detected. Forcing reconnect...'
      );

      await sock.end(undefined, undefined, {
        reason: 'inactive'
      });

      clearInterval(watchdogInterval);

      setTimeout(() => startBot(), 5000);
    }
  }, 5 * 60 * 1000);

  sock.ev.on('connection.update', (update) => {
    const { connection } = update;

    if (connection === 'open') {
      lastActivity = Date.now();
    } else if (connection === 'close') {
      clearInterval(watchdogInterval);
    }
  });

  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR mode only: do not print QR when pairing mode is enabled.
    if (qr && !pairingMode) {
      console.log('\n\nScan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      const errorMessage =
        lastDisconnect?.error?.message || 'Unknown error';

      if (
        statusCode === 515 ||
        statusCode === 503 ||
        statusCode === 408
      ) {
        console.log(
          `Connection closed (${statusCode}). Reconnecting...`
        );
      } else {
        console.log(
          'Connection closed due to:',
          errorMessage,
          '\nReconnecting:',
          shouldReconnect
        );
      }

      if (shouldReconnect) {
        setTimeout(() => startBot(), 3000);
      }
    } else if (connection === 'open') {
      console.log('\nBot connected successfully!');
      console.log(
        `Bot Number: ${sock.user.id.split(':')[0]}`
      );
      console.log(`Bot Name: ${config.botName}`);
      console.log(`Prefix: ${config.prefix}`);

      const ownerNames = Array.isArray(config.ownerName)
        ? config.ownerName.join(',')
        : config.ownerName;

      console.log(`Owner: ${ownerNames}\n`);
      console.log('Bot is ready to receive messages!\n');

      if (config.autoBio) {
        await sock.updateProfileStatus(
          `${config.botName} | Active 24/7`
        );
      }

      handler.initializeAntiCall(sock);

      // Clean up old chats
      const now = Date.now();

      for (const [jid, chatMsgs] of store.messages.entries()) {
        const timestamps = Array.from(
          chatMsgs.values()
        ).map(m => m.messageTimestamp * 1000 || 0);

        if (
          timestamps.length > 0 &&
          now - Math.max(...timestamps) > 24 * 60 * 60 * 1000
        ) {
          store.messages.delete(jid);
        }
      }

      console.log(
        `Store cleaned. Active chats: ${store.messages.size}`
      );
    }
  });

  // Credentials update handler
  sock.ev.on('creds.update', saveCreds);

  // System JID filter
  const isSystemJid = (jid) => {
    if (!jid) return true;

    return (
      jid.includes('@broadcast') ||
      jid.includes('status.broadcast') ||
      jid.includes('@newsletter') ||
      jid.includes('@newsletter.')
    );
  };

  // Messages handler
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages || []) {
      if (getRevokeInfo(msg)) {
        void notifyDeletedMessage(sock, msg, {
          store,
          config,
          getGroupMetadata: handler.getGroupMetadata
        });

        continue;
      }

      if (!msg.message || !msg.key?.id) continue;

      const from = msg.key.remoteJid;

      if (!from) continue;

      if (isSystemJid(from)) continue;

      // Optional photo-only archive
      if (
        config.photoArchive?.enabled &&
        !msg.key.fromMe &&
        msg.message?.imageMessage
      ) {
        const image = msg.message.imageMessage;
        const size = Number(image.fileLength || 0);

        const owner = Array.isArray(config.ownerNumber)
          ? config.ownerNumber[0]
          : config.ownerNumber;

        const ownerJid = owner
          ? (
              String(owner).includes('@')
                ? String(owner)
                : `${String(owner).replace(/\D/g, '')}@s.whatsapp.net`
            )
          : '';

        if (
          ownerJid &&
          (!size ||
            size <= Number(config.photoArchive.maxBytes || 8388608))
        ) {
          setImmediate(async () => {
            try {
              const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { logger: suppressedLogger }
              );

              if (
                Buffer.isBuffer(buffer) &&
                buffer.length <= Number(
                  config.photoArchive.maxBytes || 8388608
                )
              ) {
                await sock.sendMessage(ownerJid, {
                  image: buffer,
                  caption:
                    `Photo archive\n` +
                    `From: ${from}\n` +
                    `Sender: ${msg.key.participant || msg.key.remoteJid}\n` +
                    `Time: ${new Date().toISOString()}`
                });
              }
            } catch (archiveError) {
              console.error(
                '[photo-archive] Failed:',
                archiveError?.message || archiveError
              );
            }
          });
        }
      }

      // Deduplication
      const msgId = msg.key.id;

      if (processedMessages.has(msgId)) continue;

      // Timestamp validation
      const MESSAGE_AGE_LIMIT = 5 * 60 * 1000;
      let messageAge = 0;

      if (msg.messageTimestamp) {
        messageAge =
          Date.now() - msg.messageTimestamp * 1000;

        if (messageAge > MESSAGE_AGE_LIMIT) continue;
      }

      processedMessages.add(msgId);

      // Store message before processing
      if (msg.key && msg.key.id) {
        if (!store.messages.has(from)) {
          store.messages.set(from, new Map());
        }

        const chatMsgs = store.messages.get(from);
        chatMsgs.set(msg.key.id, msg);

        if (chatMsgs.size > store.maxPerChat) {
          const sortedIds = Array.from(chatMsgs.entries())
            .sort(
              (a, b) =>
                (a[1].messageTimestamp || 0) -
                (b[1].messageTimestamp || 0)
            )
            .map(([id]) => id);

          for (
            let i = 0;
            i < sortedIds.length - store.maxPerChat;
            i++
          ) {
            chatMsgs.delete(sortedIds[i]);
          }
        }
      }

      // Process command immediately
      handler.handleMessage(sock, msg).catch(err => {
        if (
          !err.message?.includes('rate-overlimit') &&
          !err.message?.includes('not-authorized')
        ) {
          console.error(
            'Error handling message:',
            err.message
          );
        }
      });

      // Background operations
      setImmediate(async () => {
        if (config.autoRead && from.endsWith('@g.us')) {
          try {
            await sock.readMessages([msg.key]);
          } catch (e) {
            // Silently handle
          }
        }

        if (from.endsWith('@g.us')) {
          try {
            const groupMetadata =
              await handler.getGroupMetadata(
                sock,
                msg.key.remoteJid
              );

            if (groupMetadata) {
              await handler.handleAntilink(
                sock,
                msg,
                groupMetadata
              );
            }
          } catch (error) {
            // Silently handle
          }
        }
      });
    }
  });

  // Message receipt updates
  sock.ev.on('message-receipt.update', () => {});

  // Outgoing message status diagnostics
  sock.ev.on('messages.update', (updates) => {
    for (const item of updates || []) {
      console.log(
        '[WA-STATUS]',
        JSON.stringify({
          id: item.key?.id,
          remoteJid: item.key?.remoteJid,
          fromMe: item.key?.fromMe,
          status: item.update?.status,
          messageStubType: item.update?.messageStubType,
          error: item.update?.error?.message || item.update?.error
        })
      );
    }
  });

  // Group participant updates
  sock.ev.on('group-participants.update', async (update) => {
    await handler.handleGroupUpdate(sock, update);
  });

  // Socket errors
  sock.ev.on('error', (error) => {
    const statusCode = error?.output?.statusCode;

    if (
      statusCode === 515 ||
      statusCode === 503 ||
      statusCode === 408
    ) {
      return;
    }

    console.error('Socket error:', error.message || error);
  });

  return sock;
}

// Multi-account supervisor
function startAccountSupervisor() {
  const raw = process.env.WHATSAPP_ACCOUNTS || '';

  const accountIds = [
    ...new Set(
      raw.split(',').map(v => v.trim()).filter(Boolean)
    )
  ];

  if (
    process.env.BOT_ACCOUNT_CHILD === '1' ||
    accountIds.length <= 1
  ) {
    return false;
  }

  const children = new Map();
  let shuttingDown = false;

  const safeId = value =>
    value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) ||
    'account';

  console.log(
    `Starting ${accountIds.length} isolated WhatsApp account processes...`
  );

  for (let index = 0; index < accountIds.length; index += 1) {
    const id = safeId(accountIds[index]);

    const sessionName =
      index === 0 ? config.sessionName : `session-${id}`;

    const env = {
      ...process.env,
      BOT_ACCOUNT_CHILD: '1',
      BOT_ACCOUNT_INDEX: String(index),
      BOT_ACCOUNT_ID: id,
      SESSION_NAME: sessionName
    };

    if (index > 0) delete env.SESSION_ID;

    const launch = () => {
      if (shuttingDown) return;

      console.log(
        `[accounts] Launching ${id} (${sessionName})`
      );

      const child = spawn(
        process.execPath,
        [__filename],
        {
          cwd: __dirname,
          env,
          stdio: 'inherit',
          windowsHide: true
        }
      );

      children.set(id, child);

      child.on('exit', (code, signal) => {
        if (shuttingDown) return;

        console.error(
          `[accounts] ${id} exited (${signal || code}); restarting in 5 seconds.`
        );

        setTimeout(launch, 5000).unref?.();
      });
    };

    launch();
  }

  const shutdown = () => {
    shuttingDown = true;

    for (const child of children.values()) {
      child.kill('SIGTERM');
    }

    setTimeout(() => process.exit(0), 3000).unref?.();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return true;
}

if (!startAccountSupervisor()) {
  console.log(
    `Starting WhatsApp MD Bot${process.env.BOT_ACCOUNT_ID ? ` [${process.env.BOT_ACCOUNT_ID}]` : ''}...\n`
  );

  console.log(`Bot Name: ${config.botName}`);
  console.log(`Prefix: ${config.prefix}`);

  const ownerNames = Array.isArray(config.ownerName)
    ? config.ownerName.join(',')
    : config.ownerName;

  console.log(`Owner: ${ownerNames}\n`);

  const database = require('./database');

  database.ready()
    .then(() => {
      console.log(
        database.isSupabaseEnabled()
          ? 'Database: Supabase (healthy)'
          : database.isSupabaseConfigured()
            ? 'Database: Supabase configured but unhealthy; local JSON fallback active'
            : 'Database: local JSON (Supabase not configured)'
      );

      return startBot();
    })
    .catch(err => {
      console.error('Error starting bot:', err);
      process.exit(1);
    });
}

// Handle process termination
process.on('uncaughtException', (err) => {
  if (
    err.code === 'ENOSPC' ||
    err.errno === -28 ||
    err.message?.includes('no space left on device')
  ) {
    console.error(
      'ENOSPC Error: No space left on device. Attempting cleanup...'
    );

    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();

    console.warn(
      'Cleanup completed. Bot will continue but may experience issues until space is freed.'
    );

    return;
  }

  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  if (
    err.code === 'ENOSPC' ||
    err.errno === -28 ||
    err.message?.includes('no space left on device')
  ) {
    console.warn(
      'ENOSPC Error in promise: No space left on device. Attempting cleanup...'
    );

    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();

    console.warn(
      'Cleanup completed. Bot will continue but may experience issues until space is freed.'
    );

    return;
  }

  if (err.message && err.message.includes('rate-overlimit')) {
    console.warn(
      'Rate limit reached. Please slow down your requests.'
    );
    return;
  }

  console.error('Unhandled Rejection:', err);
});

// Export store for use in commands
module.exports = { store };
