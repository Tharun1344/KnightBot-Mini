const COMMAND_ICONS = {
  general: '✨', ai: '🤖', group: '👥', admin: '🛡️', owner: '👑',
  media: '🎧', utility: '🧰', anime: '🌸', textmaker: '🎨',
};

const COMMAND_EMOJIS = {
  menu: '📋', list: '🗂️', ping: '🏓', uptime: '⏱️', groupinfo: '👥', groupstats: '📊',
  ai: '💬', gemini: '✨', gptimage: '🖼️', song: '🎵', lyrics: '🎼', video: '🎬', ytvideo: '📹',
  tiktok: '🎶', instagram: '📸', facebook: '👍', twitter: '🐦', pinterest: '📌',
  weather: '🌦️', calc: '🧮', translate: '🌐', sticker: '🧩', qr: '🔳', github: '🐙',
  kick: '🚪', promote: '⬆️', demote: '⬇️', warn: '⚠️', antilink: '🔗', welcome: '🎉',
  goodbye: '👋', mute: '🔇', unmute: '🔊', chatbot: '🤖', tagall: '📢', hidetag: '🔔',
  broadcast: '📣', restart: '🔄', setprefix: '⚙️', setbotname: '✒️', block: '🚫',
  unblock: '✅', afk: '💤', autoreact: '💫', autoread: '👀', attp: '🔠', crop: '✂️',
};

function styleCommandPayload(payload, command, config) {
  if (!payload || typeof payload !== 'object') return payload;
  const field = typeof payload.text === 'string'
    ? 'text'
    : typeof payload.caption === 'string' ? 'caption' : null;
  if (!field || !payload[field].trim()) return payload;

  const commandName = command?.name || 'command';
  // The menu already has a custom cover-style layout and a bot-name title.
  if (commandName === 'menu') return payload;
  const marker = `· ${config.prefix}${commandName}`;
  if (payload[field].includes(marker)) return payload;

  const icon = COMMAND_EMOJIS[commandName] || COMMAND_ICONS[command?.category] || '✨';
  const heading = `╭──〔 ${icon} *${config.prefix}${commandName}* 〕\n│ 🤖 *${config.botName}*\n╰──────────────────`;
  return { ...payload, [field]: `${heading}\n\n${payload[field]}` };
}

function createCommandSocket(sock, command, config) {
  return new Proxy(sock, {
    get(target, property) {
      if (property === 'sendMessage') {
        return (jid, payload, options) =>
          target.sendMessage(jid, styleCommandPayload(payload, command, config), options);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

module.exports = { styleCommandPayload, createCommandSocket };
