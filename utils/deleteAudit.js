/**
 * Send a private audit note when WhatsApp reports a message revoked for everyone.
 * Only messages still present in the bot's in-memory message store can include content.
 */

const MAX_CONTENT_LENGTH = 3000;
const recentRevocations = new Map();
const REVOCATION_TTL = 10 * 60 * 1000;

function unwrapContent(message) {
  let content = message || {};
  for (let i = 0; i < 6; i += 1) {
    const nested = content.ephemeralMessage?.message
      || content.viewOnceMessageV2?.message
      || content.viewOnceMessage?.message
      || content.documentWithCaptionMessage?.message;
    if (!nested) break;
    content = nested;
  }
  return content;
}

function getRevokeInfo(msg) {
  const content = unwrapContent(msg?.message);
  const protocol = content.protocolMessage;
  if (!protocol?.key) return null;
  const type = String(protocol.type ?? '').toUpperCase();
  return type === 'REVOKE' || type === '0' ? protocol : null;
}

function normalizeJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const [user, server = ''] = jid.split('@');
  if (!server) return `${user.replace(/\D/g, '')}@s.whatsapp.net`;
  return `${user.split(':')[0]}@${server}`;
}

function labelJid(jid) {
  if (!jid) return 'Unknown';
  const user = jid.split('@')[0].split(':')[0];
  return `@${user}`;
}

function summarizeMessage(message) {
  const content = unwrapContent(message?.message);
  const types = [
    ['conversation', 'Text'],
    ['extendedTextMessage', 'Text'],
    ['imageMessage', 'Photo'],
    ['videoMessage', 'Video'],
    ['audioMessage', 'Audio'],
    ['documentMessage', 'Document'],
    ['stickerMessage', 'Sticker'],
    ['contactMessage', 'Contact'],
    ['locationMessage', 'Location'],
    ['liveLocationMessage', 'Live location'],
    ['pollCreationMessage', 'Poll'],
    ['pollCreationMessageV3', 'Poll'],
    ['buttonsMessage', 'Buttons'],
    ['listMessage', 'List'],
  ];

  const entry = types.find(([key]) => content[key]);
  if (!entry) return { type: 'Unknown message', text: '[Original content is unavailable]' };

  const [key, label] = entry;
  const item = content[key];
  let text = key === 'conversation' ? item : item?.text || item?.caption || '';
  if (key === 'documentMessage' && item?.fileName) {
    text = text ? `${item.fileName}\n${text}` : item.fileName;
  }
  if (key === 'contactMessage') text = item?.displayName || '';
  if (key === 'locationMessage' || key === 'liveLocationMessage') {
    const lat = item?.degreesLatitude;
    const lon = item?.degreesLongitude;
    text = lat != null && lon != null ? `${lat}, ${lon}` : '';
  }
  if (!text) text = `[${label} message; no caption/text]`;
  if (text.length > MAX_CONTENT_LENGTH) text = `${text.slice(0, MAX_CONTENT_LENGTH)}… [truncated]`;
  return { type: label, text };
}

function formatEventTime(timestamp, timezone = 'Asia/Colombo') {
  const numeric = Number(timestamp);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date();
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

async function notifyDeletedMessage(sock, msg, { store, config, getGroupMetadata } = {}) {
  try {
    const protocol = getRevokeInfo(msg);
    const originalKey = protocol?.key;
    if (!originalKey?.id) return false;

    const chatJid = originalKey.remoteJid || msg.key?.remoteJid;
    if (!chatJid) return false;

    const dedupeKey = `${chatJid}:${originalKey.id}`;
    const now = Date.now();
    for (const [key, seenAt] of recentRevocations) {
      if (now - seenAt > REVOCATION_TTL) recentRevocations.delete(key);
    }
    if (recentRevocations.has(dedupeKey)) return false;
    recentRevocations.set(dedupeKey, now);

    const ownerList = Array.isArray(config?.ownerNumber) ? config.ownerNumber : [config?.ownerNumber];
    const ownerJid = normalizeJid(ownerList.find(Boolean));
    if (!ownerJid) return false;

    const original = await store?.loadMessage?.(chatJid, originalKey.id);
    const summary = summarizeMessage(original);
    const deleter = msg.key?.participant || msg.participant
      || (msg.key?.fromMe ? sock.user?.id : msg.key?.remoteJid);
    const originalSender = originalKey.fromMe
      ? 'The bot account'
      : labelJid(originalKey.participant || original?.key?.participant || original?.key?.remoteJid);

    let chatLabel = chatJid.endsWith('@g.us') ? `Group ${chatJid}` : labelJid(chatJid);
    if (chatJid.endsWith('@g.us') && typeof getGroupMetadata === 'function') {
      try {
        const metadata = await getGroupMetadata(sock, chatJid);
        if (metadata?.subject) chatLabel = `${metadata.subject} (${chatJid})`;
      } catch { /* Keep the JID as a useful fallback. */ }
    }

    const details = [
      '🗑️ *Message deleted for everyone*',
      '',
      `📍 Chat: ${chatLabel}`,
      `👤 Deleted by: ${labelJid(deleter)}`,
      `✉️ Original sender: ${originalSender}`,
      `🕒 Deleted at: ${formatEventTime(msg.messageTimestamp, config?.timezone)}`,
      `🧩 Type: ${summary.type}`,
      `📝 Content:\n${summary.text}`,
    ].join('\n');

    await sock.sendMessage(ownerJid, { text: details });
    return true;
  } catch (error) {
    console.error('[delete-audit] Could not notify owner:', error?.message || error);
    return false;
  }
}

module.exports = {
  unwrapContent,
  getRevokeInfo,
  summarizeMessage,
  formatEventTime,
  notifyDeletedMessage,
};
