
require('dotenv').config({ override: false });

/**
 * KnightBot-Mini WhatsApp MD Bot
 * Main entry point
 */

process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR =
  process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

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

function shouldSuppressConsole(args, patterns) {
  const message = args
    .map(value => {
      if (typeof value === 'string') return value;

      if (value && typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return '[unserializable object]';
        }
      }

      return String(value);
    })
    .join(' ')
    .toLowerCase();

  return patterns.some(pattern => message.includes(pattern));
}

console.log = (...args) => {
  if (!shouldSuppressConsole(args, forbiddenPatternsConsole)) {
    originalConsoleLog.apply(console, args);
  }
};

console.error = (...args) => {
  if (!shouldSuppressConsole(args, forbiddenPatternsConsole)) {
    originalConsoleError.apply(console, args);
  }
};

console.warn = (...args) => {
  if (!shouldSuppressConsole(args, forbiddenPatternsConsole)) {
    originalConsoleWarn.apply(console, args);
  }
};

const pino = require('pino');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
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

/*
 * Remove Puppeteer cache when present.
 */
function cleanupPuppeteerCache() {
  try {
    const cacheDir = path.join(
      os.homedir(),
      '.cache',
      'puppeteer'
    );

    if (fs.existsSync(cacheDir)) {
      console.log('Removing Puppeteer cache:', cacheDir);

      fs.rmSync(cacheDir, {
        recursive: true,
        force: true
      });

      console.log('Puppeteer cache removed.');
    }
  } catch (error) {
    console.error(
      'Failed to clean Puppeteer cache:',
      error?.message || error
    );
  }
}

/*
 * In-memory message store.
 */
const store = {
  messages: new Map(),
  maxPerChat: 200,

  bind(ev) {
    ev.on('messages.upsert', ({ messages = [] }) => {
      for (const msg of messages) {
        if (!msg?.key?.id || getRevokeInfo(msg)) continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;

        if (!store.messages.has(jid)) {
          store.messages.set(jid, new Map());
        }

        const chatMessages = store.messages.get(jid);

        chatMessages.set(msg.key.id, msg);

        while (chatMessages.size > store.maxPerChat) {
          const oldestKey = chatMessages.keys().next().value;

          if (oldestKey === undefined) break;

          chatMessages.delete(oldestKey);
        }
      }
    });
  },

  async loadMessage(jid, id) {
    return store.messages.get(jid)?.get(id) || null;
  }
};

/*
 * Message deduplication.
 */
const processedMessages = new Set();

const processedMessagesCleanup = setInterval(() => {
  processedMessages.clear();
}, 5 * 60 * 1000);

processedMessagesCleanup.unref?.();

/*
 * Suppressed Pino logger.
 */
function createSuppressedLogger(level = 'silent') {
  const forbiddenPatterns = [
    ...forbiddenPatternsConsole,
    'ratchetkey'
  ];

  let logger;

  try {
    logger = pino({
      level,

      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                ignore: 'pid,hostname'
              }
            },

      redact: [
        'registrationId',
        'ephemeralKeyPair',
        'rootKey',
        'chainKey',
        'baseKey'
      ]
    });
  } catch {
    logger = pino({ level });
  }

  const originalInfo = logger.info.bind(logger);

  logger.info = (...args) => {
    if (!shouldSuppressConsole(args, forbiddenPatterns)) {
      originalInfo(...args);
    }
  };

  logger.debug = () => {};
  logger.trace = () => {};

  return logger;
}

/*
 * Pairing number configuration.
 *
 * Set this in the hosting panel:
 * PAIRING_NUMBER=947XXXXXXXX
 *
 * Use the complete international number:
 * - Include the country code.
 * - Do not include a plus sign.
 * - Do not include spaces or hyphens.
 *
 * If the existing session is already registered,
 * the saved session will be reused.
 */
function getPairingConfiguration(state) {
  const raw = String(
    process.env.PAIRING_NUMBER || ''
  ).trim();

  const number = raw.replace(/\D/g, '');

  const valid = /^\d{8,15}$/.test(number);

  const mode =
    Boolean(raw) &&
    valid &&
    !state.creds.registered;

  if (raw && !valid) {
    console.error(
      '[PAIRING] Invalid PAIRING_NUMBER. Use the full international number with digits only.'
    );
  }

  if (raw && valid && state.creds.registered) {
    console.log(
      '[PAIRING] An existing registered session was found. Reusing saved credentials.'
    );
  }

  if (!raw && !state.creds.registered) {
    console.log(
      '[PAIRING] PAIRING_NUMBER is not configured. QR login will be used.'
    );
  }

  return {
    number,
    mode
  };
}

/*
 * Main WhatsApp connection.
 */
async function startBot() {
  const sessionFolder = path.join(
    __dirname,
    config.sessionName
  );

  const sessionFile = path.join(
    sessionFolder,
    'creds.json'
  );

  /*
   * Import a supplied KnightBot session, if configured.
   */
  if (
    config.sessionID &&
    config.sessionID.startsWith('KnightBot!')
  ) {
    try {
      const [header, base64Data] =
        config.sessionID.split('!');

      if (header !== 'KnightBot' || !base64Data) {
        throw new Error(
          "Invalid session format. Expected 'KnightBot!.....'."
        );
      }

      const cleanBase64 = base64Data.replace('...', '');

      const compressedData = Buffer.from(
        cleanBase64,
        'base64'
      );

      const decompressedData = zlib.gunzipSync(
        compressedData
      );

      fs.mkdirSync(sessionFolder, {
        recursive: true
      });

      fs.writeFileSync(
        sessionFile,
        decompressedData,
        'utf8'
      );

      console.log(
        'Session retrieved from KnightBot Session.'
      );
    } catch (error) {
      console.error(
        'Error processing KnightBot session:',
        error?.message || error
      );
    }
  }

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionFolder);

  const { version } =
    await fetchLatestBaileysVersion();

  const logger = createSuppressedLogger('silent');

  const {
    number: pairingNumber,
    mode: pairingMode
  } = getPairingConfiguration(state);

  const sock = makeWASocket({
    version,
    logger,

    printQRInTerminal: false,

    browser: [
      'Chrome',
      'Windows',
      '10.0'
    ],

    auth: state,

    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: false,

    getMessage: async () => undefined
  });

  /*
   * Pairing-code fix:
   *
   * Do not use an arbitrary setTimeout to request a code.
   * Wait for Baileys to emit its QR/registration event,
   * then request a code only once for this socket.
   */
  let pairingCodeRequested = false;

  /*
   * Store messages.
   */
  store.bind(sock.ev);

  /*
   * Socket inactivity watchdog.
   */
  let lastActivity = Date.now();

  const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

  sock.ev.on('messages.upsert', () => {
    lastActivity = Date.now();
  });

  const watchdogInterval = setInterval(async () => {
    try {
      if (
        Date.now() - lastActivity > INACTIVITY_TIMEOUT &&
        sock.ws?.readyState === 1
      ) {
        console.log(
          'No activity detected. Reconnecting socket...'
        );

        clearInterval(watchdogInterval);

        await sock.end(undefined, undefined, {
          reason: 'inactive'
        });

        setTimeout(() => {
          startBot().catch(error => {
            console.error(
              '[WATCHDOG] Restart failed:',
              error?.message || error
            );
          });
        }, 5000);
      }
    } catch (error) {
      console.error(
        '[WATCHDOG] Error:',
        error?.message || error
      );
    }
  }, 5 * 60 * 1000);

  watchdogInterval.unref?.();

  sock.ev.on('connection.update', update => {
    const { connection } = update;

    if (connection === 'open') {
      lastActivity = Date.now();
    }

    if (connection === 'close') {
      clearInterval(watchdogInterval);
    }
  });

  /*
   * Connection updates and login.
   */
  sock.ev.on(
    'connection.update',
    async update => {
      const {
        connection,
        lastDisconnect,
        qr
      } = update;

      /*
       * Pairing-code login.
       */
      if (
        qr &&
        pairingMode &&
        !pairingCodeRequested
      ) {
        pairingCodeRequested = true;

        try {
          if (
            typeof sock.requestPairingCode !== 'function'
          ) {
            throw new Error(
              'requestPairingCode() is unavailable in the installed Baileys version.'
            );
          }

          const code =
            await sock.requestPairingCode(
              pairingNumber
            );

          console.log(
            '\n========================================'
          );
          console.log(
            ' WHATSAPP PHONE-NUMBER PAIRING CODE'
          );
          console.log(
            '========================================'
          );

          console.log(`\n  ${code}\n`);

          console.log('On your phone:');
          console.log('1. Open WhatsApp.');
          console.log('2. Open Linked devices.');
          console.log('3. Tap Link a device.');
          console.log(
            '4. Choose Link with phone number instead.'
          );
          console.log(
            '5. Enter the newly generated code promptly.'
          );

          console.log(
            '\nDo not share this code with anyone.'
          );

          console.log(
            '========================================\n'
          );
        } catch (error) {
          /*
           * Permit a later QR update to retry if the
           * initial pairing-code request fails.
           */
          pairingCodeRequested = false;

          console.error(
            '[PAIRING] Failed to request pairing code:',
            error?.message || error
          );

          console.error(
            '[PAIRING] Check PAIRING_NUMBER, your saved session, and the installed Baileys version.'
          );
        }
      } else if (qr && !pairingMode) {
        /*
         * Standard QR login remains available when
         * pairing mode is not enabled.
         */
        console.log(
          '\n\nScan this QR code with WhatsApp:\n'
        );

        qrcode.generate(qr, {
          small: true
        });
      }

      /*
       * Handle connection closures.
       */
      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        const errorMessage =
          lastDisconnect?.error?.message ||
          'Unknown error';

        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut;

        if (
          statusCode === 515 ||
          statusCode === 503 ||
          statusCode === 408
        ) {
          console.log(
            `Connection closed (${statusCode}).`
          );
        } else {
          console.log(
            'Connection closed:',
            errorMessage
          );
        }

        if (shouldReconnect) {
          setTimeout(() => {
            startBot().catch(error => {
              console.error(
                '[RECONNECT] Restart failed:',
                error?.message || error
              );
            });
          }, 3000);
        } else {
          console.error(
            '[AUTH] WhatsApp logged out. Remove the old session only if you intend to pair again.'
          );
        }

        return;
      }

      /*
       * Successful connection.
       */
      if (connection === 'open') {
        lastActivity = Date.now();

        console.log(
          '\nBot connected successfully!'
        );

        console.log(
          `Bot Number: ${sock.user?.id?.split(':')[0] || 'Unknown'}`
        );

        console.log(
          `Bot Name: ${config.botName}`
        );

        console.log(
          `Prefix: ${config.prefix}`
        );

        const ownerNames =
          Array.isArray(config.ownerName)
            ? config.ownerName.join(',')
            : config.ownerName;

        console.log(
          `Owner: ${ownerNames}\n`
        );

        console.log(
          'Bot is ready to receive messages!\n'
        );

        if (config.autoBio) {
          try {
            await sock.updateProfileStatus(
              `${config.botName} | Active 24/7`
            );
          } catch (error) {
            console.error(
              '[PROFILE] Could not update status:',
              error?.message || error
            );
          }
        }

        try {
          handler.initializeAntiCall(sock);
        } catch (error) {
          console.error(
            '[ANTICALL] Initialization failed:',
            error?.message || error
          );
        }

        /*
         * Clean old stored chats.
         */
        const now = Date.now();

        for (
          const [jid, chatMessages]
          of store.messages.entries()
        ) {
          const timestamps = Array.from(
            chatMessages.values()
          ).map(message =>
            Number(message.messageTimestamp || 0) * 1000
          );

          if (
            timestamps.length > 0 &&
            now - Math.max(...timestamps) >
              24 * 60 * 60 * 1000
          ) {
            store.messages.delete(jid);
          }
        }

        console.log(
          `Store cleaned. Active chats: ${store.messages.size}`
        );
      }
    }
  );

  /*
   * Save updated WhatsApp credentials.
   */
  sock.ev.on('creds.update', saveCreds);

  /*
   * Ignore system/broadcast JIDs.
   */
  function isSystemJid(jid) {
    if (!jid) return true;

    return (
      jid.includes('@broadcast') ||
      jid.includes('status.broadcast') ||
      jid.includes('@newsletter') ||
      jid.includes('@newsletter.')
    );
  }

  /*
   * Incoming message handler.
   */
  sock.ev.on(
    'messages.upsert',
    ({ messages = [], type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        /*
         * Deleted-message auditing.
         */
        if (getRevokeInfo(msg)) {
          void notifyDeletedMessage(sock, msg, {
            store,
            config,
            getGroupMetadata: handler.getGroupMetadata
          });

          continue;
        }

        if (!msg.message || !msg.key?.id) {
          continue;
        }

        const from = msg.key.remoteJid;

        if (!from || isSystemJid(from)) {
          continue;
        }

        /*
         * Optional photo-only archive.
         * This forwards images only, not all message types.
         */
        if (
          config.photoArchive?.enabled &&
          !msg.key.fromMe &&
          msg.message?.imageMessage
        ) {
          const image = msg.message.imageMessage;

          const declaredSize = Number(
            image.fileLength || 0
          );

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

          const maxBytes = Number(
            config.photoArchive.maxBytes || 8388608
          );

          if (
            ownerJid &&
            (!declaredSize || declaredSize <= maxBytes)
          ) {
            setImmediate(async () => {
              try {
                const buffer =
                  await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    { logger }
                  );

                if (
                  Buffer.isBuffer(buffer) &&
                  buffer.length <= maxBytes
                ) {
                  await sock.sendMessage(ownerJid, {
                    image: buffer,

                    caption:
                      `Photo archive\n` +
                      `From: ${from}\n` +
                      `Sender: ${msg.key.participant || from}\n` +
                      `Time: ${new Date().toISOString()}`
                  });
                }
              } catch (error) {
                console.error(
                  '[PHOTO-ARCHIVE] Failed:',
                  error?.message || error
                );
              }
            });
          }
        }

        /*
         * Avoid duplicate processing.
         */
        const messageId = msg.key.id;

        if (processedMessages.has(messageId)) {
          continue;
        }

        /*
         * Ignore messages older than five minutes.
         */
        const MESSAGE_AGE_LIMIT = 5 * 60 * 1000;

        if (msg.messageTimestamp) {
          const messageAge =
            Date.now() -
            Number(msg.messageTimestamp) * 1000;

          if (messageAge > MESSAGE_AGE_LIMIT) {
            continue;
          }
        }

        processedMessages.add(messageId);

        /*
         * Save message in the in-memory store.
         */
        if (!store.messages.has(from)) {
          store.messages.set(from, new Map());
        }

        const chatMessages =
          store.messages.get(from);

        chatMessages.set(messageId, msg);

        while (
          chatMessages.size > store.maxPerChat
        ) {
          const sortedIds = Array.from(
            chatMessages.entries()
          )
            .sort(
              (a, b) =>
                Number(a[1].messageTimestamp || 0) -
                Number(b[1].messageTimestamp || 0)
            )
            .map(([id]) => id);

          const oldestId = sortedIds[0];

          if (oldestId === undefined) break;

          chatMessages.delete(oldestId);
        }

        /*
         * Process commands and normal messages.
         */
        Promise.resolve(
          handler.handleMessage(sock, msg)
        ).catch(error => {
          const message = error?.message || String(error);

          if (
            !message.includes('rate-overlimit') &&
            !message.includes('not-authorized')
          ) {
            console.error(
              '[MESSAGE-HANDLER] Error:',
              message
            );
          }
        });

        /*
         * Background group operations.
         */
        setImmediate(async () => {
          if (
            config.autoRead &&
            from.endsWith('@g.us')
          ) {
            try {
              await sock.readMessages([msg.key]);
            } catch {
              // Read receipt errors are non-fatal.
            }
          }

          if (from.endsWith('@g.us')) {
            try {
              const metadata =
                await handler.getGroupMetadata(
                  sock,
                  from
                );

              if (metadata) {
                await handler.handleAntilink(
                  sock,
                  msg,
                  metadata
                );
              }
            } catch {
              // Group metadata may be temporarily unavailable.
            }
          }
        });
      }
    }
  );

  /*
   * Message receipt updates.
   */
  sock.ev.on(
    'message-receipt.update',
    () => {}
  );

  /*
   * Outgoing message diagnostics.
   */
  sock.ev.on(
    'messages.update',
    updates => {
      for (const item of updates || []) {
        console.log(
          '[WA-STATUS]',
          JSON.stringify({
            id: item.key?.id,
            remoteJid: item.key?.remoteJid,
            fromMe: item.key?.fromMe,
            status: item.update?.status,
            messageStubType:
              item.update?.messageStubType,
            error:
              item.update?.error?.message ||
              item.update?.error
          })
        );
      }
    }
  );

  /*
   * Group participant updates.
   */
  sock.ev.on(
    'group-participants.update',
    async update => {
      try {
        await handler.handleGroupUpdate(
          sock,
          update
        );
      } catch (error) {
        console.error(
          '[GROUP-UPDATE] Failed:',
          error?.message || error
        );
      }
    }
  );

  /*
   * Socket errors.
   */
  sock.ev.on('error', error => {
    const statusCode =
      error?.output?.statusCode;

    if (
      statusCode === 515 ||
      statusCode === 503 ||
      statusCode === 408
    ) {
      return;
    }

    console.error(
      '[SOCKET] Error:',
      error?.message || error
    );
  });

  return sock;
}

/*
 * Optional multi-account supervisor.
 *
 * WHATSAPP_ACCOUNTS=main,second,third
 *
 * Each account runs in a separate process.
 */
function startAccountSupervisor() {
  const raw =
    process.env.WHATSAPP_ACCOUNTS || '';

  const accountIds = [
    ...new Set(
      raw
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
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

  function safeId(value) {
    return (
      value
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 32) || 'account'
    );
  }

  console.log(
    `Starting ${accountIds.length} isolated WhatsApp account processes...`
  );

  for (
    let index = 0;
    index < accountIds.length;
    index += 1
  ) {
    const id = safeId(accountIds[index]);

    const sessionName =
      index === 0
        ? config.sessionName
        : `session-${id}`;

    const env = {
      ...process.env,
      BOT_ACCOUNT_CHILD: '1',
      BOT_ACCOUNT_INDEX: String(index),
      BOT_ACCOUNT_ID: id,
      SESSION_NAME: sessionName
    };

    if (index > 0) {
      delete env.SESSION_ID;
    }

    function launch() {
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

      child.on('error', error => {
        console.error(
          `[accounts] Could not launch ${id}:`,
          error?.message || error
        );
      });

      child.on('exit', (code, signal) => {
        if (shuttingDown) return;

        console.error(
          `[accounts] ${id} exited (${signal || code}); restarting in 5 seconds.`
        );

        const restartTimer = setTimeout(
          launch,
          5000
        );

        restartTimer.unref?.();
      });
    }

    launch();
  }

  function shutdown() {
    if (shuttingDown) return;

    shuttingDown = true;

    for (const child of children.values()) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Child may already have exited.
      }
    }

    const exitTimer = setTimeout(
      () => process.exit(0),
      3000
    );

    exitTimer.unref?.();
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return true;
}

/*
 * Startup.
 */
if (!startAccountSupervisor()) {
  console.log(
    `Starting WhatsApp MD Bot${
      process.env.BOT_ACCOUNT_ID
        ? ` [${process.env.BOT_ACCOUNT_ID}]`
        : ''
    }...\n`
  );

  console.log(`Bot Name: ${config.botName}`);
  console.log(`Prefix: ${config.prefix}`);

  const ownerNames =
    Array.isArray(config.ownerName)
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
    .catch(error => {
      console.error(
        'Error starting bot:',
        error?.message || error
      );

      process.exitCode = 1;
    });
}

/*
 * Process-level error handling.
 */
process.on('uncaughtException', error => {
  if (
    error?.code === 'ENOSPC' ||
    error?.errno === -28 ||
    error?.message?.includes('no space left on device')
  ) {
    console.error(
      'ENOSPC: No space left on device. Attempting cleanup...'
    );

    try {
      const { cleanupOldFiles } =
        require('./utils/cleanup');

      cleanupOldFiles();

      console.warn(
        'Cleanup attempted. Check available disk space if errors continue.'
      );
    } catch (cleanupError) {
      console.error(
        'Disk cleanup failed:',
        cleanupError?.message || cleanupError
      );
    }

    return;
  }

  console.error(
    'Uncaught Exception:',
    error
  );
});

process.on('unhandledRejection', error => {
  if (
    error?.code === 'ENOSPC' ||
    error?.errno === -28 ||
    error?.message?.includes('no space left on device')
  ) {
    console.warn(
      'ENOSPC in promise: attempting cleanup...'
    );

    try {
      const { cleanupOldFiles } =
        require('./utils/cleanup');

      cleanupOldFiles();
    } catch (cleanupError) {
      console.error(
        'Cleanup failed:',
        cleanupError?.message || cleanupError
      );
    }

    return;
  }

  if (
    error?.message?.includes('rate-overlimit')
  ) {
    console.warn(
      'Rate limit reached. Slow down requests.'
    );

    return;
  }

  console.error(
    'Unhandled Rejection:',
    error
  );
});

/*
 * Export the store for command modules.
 */
module.exports = {
  store,
  startBot,
  cleanupPuppeteerCache
};
