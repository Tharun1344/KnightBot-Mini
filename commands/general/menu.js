/**
 * Menu Command - Display all available commands
 * Clean, minimal layout (no heavy box borders)
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { social = {} } = config;
const { loadCommands } = require('../../utils/commandLoader');

// Order + icon for each category. Add new category folders here as they appear.
const CATEGORY_DISPLAY = [
  { key: 'general',   label: 'General',   icon: '🧭' },
  { key: 'ai',         label: 'AI',         icon: '🤖' },
  { key: 'group',      label: 'Group',      icon: '👥' },
  { key: 'admin',      label: 'Admin',      icon: '🛡️' },
  { key: 'owner',      label: 'Owner',      icon: '👑' },
  { key: 'media',      label: 'Media',      icon: '🎧' },
  { key: 'utility',    label: 'Utility',    icon: '🧰' },
  { key: 'anime',      label: 'Anime',      icon: '👾' },
  { key: 'textmaker',  label: 'Text Maker', icon: '🖋️' },
];

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();

      // The menu's advertised help syntax should answer for the requested command.
      if (args?.[0]) {
        const requestedName = args[0].toLowerCase();
        const requested = commands.get(requestedName);
        if (!requested) {
          return await extra.reply(`❓ I couldn't find *${requestedName}*. Try *${config.prefix}menu* to browse the commands.`);
        }
        const aliases = (requested.aliases || []).filter((alias) => alias !== requested.name);
        const details = [
          `🔎 *${config.prefix}${requested.name}*`,
          '',
          `📝 ${requested.description || 'No description available.'}`,
          `💬 Usage: *${requested.usage || `${config.prefix}${requested.name}`}*`,
          aliases.length ? `🔁 Aliases: ${aliases.map((alias) => `\`${alias}\``).join(', ')}` : '',
          requested.ownerOnly ? '🔐 Owner only' : '',
          requested.adminOnly ? '🛡️ Group admin only' : '',
        ].filter(Boolean).join('\n');
        return await extra.reply(details);
      }

      const categories = {};

      // Group commands by category (main names only, not aliases)
      commands.forEach((cmd, name) => {
        if (cmd.name === name) {
          if (!categories[cmd.category]) categories[cmd.category] = [];
          categories[cmd.category].push(cmd);
        }
      });

      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';
      const senderTag = `@${extra.sender.split('@')[0]}`;

      let menuText = `✨ *${config.botName}*\n`;
      menuText += `Hey ${senderTag}, here's what I can do 👋\n\n`;
      const commandCount = [...commands.entries()].filter(([name, cmd]) => cmd.name === name).length;
      menuText += `⚡ Prefix   : ${config.prefix}\n`;
      menuText += `📦 Commands : ${commandCount}\n`;
      menuText += `👑 Owner    : ${displayOwner}\n`;
      menuText += `\n─────────────────\n`;

      for (const { key, label, icon } of CATEGORY_DISPLAY) {
        let cmdList = categories[key];
        if (!cmdList || !cmdList.length) continue;

        // Owner-only commands only show to the owner
        cmdList = cmdList.filter(cmd => !cmd.ownerOnly || extra.isOwner);
        if (!cmdList.length) continue;

        menuText += `\n${icon} *${label}*\n`;
        const names = cmdList.map(cmd => `${config.prefix}${cmd.name}`);
        menuText += names.join('  •  ') + `\n`;
      }

      menuText += `\n─────────────────\n`;
      menuText += `💡 ${config.prefix}help <command> for details\n`;
      const validLink = (value) => value && /^https:\/\//i.test(value) && !value.startsWith('ADD_YOUR_');
      menuText += `\n🔗 *Connect with me*\n`;
      menuText += `📱 WhatsApp: ${validLink(social.whatsapp) ? social.whatsapp : 'Set BOT_WHATSAPP_LINK in config/.env'}\n`;
      menuText += `💻 GitHub: ${validLink(social.github) ? social.github : 'Set BOT_GITHUB_LINK in config/.env'}\n`;
      menuText += `📘 Facebook: ${validLink(social.facebook) ? social.facebook : 'Set BOT_FACEBOOK_LINK in config/.env'}\n`;
      menuText += `\n🌟 v1.0.4`;

      // Send menu with image
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');

      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: menuText,
          mentions: [extra.sender]
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: menuText,
          mentions: [extra.sender]
        }, { quoted: msg });
      }

    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
