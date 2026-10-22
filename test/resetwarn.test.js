const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { createCommandSocket } = require('../utils/replyStyle');

function loadResetWarn(database) {
  const commandPath = path.resolve(__dirname, '../commands/admin/resetwarn.js');
  delete require.cache[commandPath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === commandPath && request === '../../database') return database;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(commandPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('resetwarn no-warning reply preserves WhatsApp mention metadata and command UI', async () => {
  const target = '94770000000@s.whatsapp.net';
  const command = loadResetWarn({ getWarnings: () => ({ count: 0 }) });
  const sent = [];
  const rawSocket = { sendMessage: async (...args) => sent.push(args) };
  const config = { botName: 'Tharun Bot', prefix: '.' };
  const sock = createCommandSocket(rawSocket, command, config);
  const msg = {
    key: { remoteJid: 'group@g.us', id: 'incoming' },
    message: { extendedTextMessage: { contextInfo: { mentionedJid: [target] } } },
  };

  await command.execute(sock, msg, [], { from: 'group@g.us' });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0][1].mentions, [target]);
  assert.match(sent[0][1].text, /\.resetwarn/);
  assert.match(sent[0][1].text, /has no warnings to reset/);
});
