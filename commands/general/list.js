/**
 * List Command
 * Show all commands with descriptions
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');

// Gracefully try to load gifted-btns; fall back to plain text if unavailable.
let sendButtons = null;
try {
  sendButtons = require('gifted-btns').sendButtons;
} catch (_e) {
  // gifted-btns not available — plain text fallback will be used
}

module.exports = {
  name: 'list',
  aliases: [],
  description: 'List all commands with descriptions',
  usage: '.list',
  category: 'general',
  
  async execute(sock, msg, args, extra) {
    try {
      const prefix = config.prefix;
      const commands = loadCommands();
      const categories = {};
      
      // Group commands by category
      commands.forEach((cmd, name) => {
        if (cmd.name === name) { // Only count main command names, not aliases
          const category = (cmd.category || 'other').toLowerCase();
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push({
            label: cmd.description || '',
            names: [cmd.name].concat(cmd.aliases || []),
          });
        }
      });
      
      let menu = `*${config.botName} - Commands List*\n`;
      menu += `Prefix: *${prefix}*\n\n`;
      
      const orderedCats = Object.keys(categories).sort();
      
      for (const cat of orderedCats) {
        menu += `*📂 ${cat.toUpperCase()}*\n`;
        for (const entry of categories[cat]) {
          const cmdList = entry.names.map((n) => `${prefix}${n}`).join(', ');
          const label = entry.label || '';
          menu += label ? `• \`${cmdList}\` - ${label}\n` : `• ${cmdList}\n`;
        }
        menu += '\n';
      }
      
      menu = menu.trimEnd();
      
      
      // Send message with buttons using gifted-btns (or plain text if unavailable)
      if (sendButtons) {
        try {
          await sendButtons(sock, extra.from, {
            title: '',
            text: menu,
            footer: `> *Powered by ${config.botName}*`,
            buttons: [
              {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                  display_text: 'Visit Bot Repo',
                  url: config.social?.github || 'https://github.com/'
                })
              },
              {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                  display_text: 'WhatsApp',
                  url: config.social?.whatsapp || 'https://wa.me/'
                })
              }
            ]
          }, { quoted: msg });
        } catch (_btnErr) {
          // Fallback if sendButtons fails
          await sock.sendMessage(extra.from, { text: menu + `\n\n> *Powered by ${config.botName}*` }, { quoted: msg });
        }
      } else {
        await sock.sendMessage(extra.from, { text: menu + `\n\n> *Powered by ${config.botName}*` }, { quoted: msg });
      }
      
    } catch (err) {
      console.error('list.js error:', err);
      await extra.reply('❌ Failed to load commands list.');
    }
  }
};

