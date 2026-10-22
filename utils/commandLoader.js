/**
 * Command Loader - Loads only the command categories enabled for this bot.
 */

const fs = require('fs');
const path = require('path');

const DISABLED_CATEGORIES = new Set(['fun', 'economy']);

const loadCommands = () => {
  const commands = new Map();
  const commandsPath = path.join(__dirname, '..', 'commands');

  if (!fs.existsSync(commandsPath)) {
    console.log('Commands directory not found');
    return commands;
  }

  for (const category of fs.readdirSync(commandsPath)) {
    if (DISABLED_CATEGORIES.has(category.toLowerCase())) continue;

    const categoryPath = path.join(commandsPath, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter((file) => file.endsWith('.js'));
    for (const file of files) {
      try {
        const command = require(path.join(categoryPath, file));
        if (!command?.name) continue;

        commands.set(command.name, command);
        for (const alias of command.aliases || []) {
          commands.set(alias, command);
        }
      } catch (error) {
        console.error(`Error loading command ${file}:`, error.message);
      }
    }
  }

  return commands;
};

module.exports = { loadCommands };
