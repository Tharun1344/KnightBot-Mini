const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getRevokeInfo,
  summarizeMessage,
  notifyDeletedMessage,
} = require('../utils/deleteAudit');

test('detects REVOKE protocol messages inside ephemeral wrappers', () => {
  const target = { id: 'target-1', remoteJid: 'chat@g.us' };
  const revoke = {
    message: {
      ephemeralMessage: {
        message: { protocolMessage: { type: 'REVOKE', key: target } },
      },
    },
  };
  assert.deepEqual(getRevokeInfo(revoke).key, target);
});

test('summarizes text and media captions', () => {
  assert.deepEqual(
    summarizeMessage({ message: { conversation: 'Hello there' } }),
    { type: 'Text', text: 'Hello there' },
  );
  assert.deepEqual(
    summarizeMessage({ message: { imageMessage: { caption: 'Photo caption' } } }),
    { type: 'Photo', text: 'Photo caption' },
  );
});

test('sends one owner-only deletion report with actor, sender, chat and content', async () => {
  const targetKey = {
    id: 'audit-test-target-unique',
    remoteJid: 'group@g.us',
    participant: 'author@s.whatsapp.net',
  };
  const revoke = {
    key: { id: 'revoke-event', remoteJid: 'group@g.us', participant: 'deleter@s.whatsapp.net' },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { protocolMessage: { type: 'REVOKE', key: targetKey } },
  };
  const original = {
    key: targetKey,
    message: { extendedTextMessage: { text: 'Message that was deleted' } },
  };
  const sent = [];
  const sock = { sendMessage: async (...args) => sent.push(args) };
  const store = { loadMessage: async () => original };
  const config = { ownerNumber: ['94770000000'], timezone: 'Asia/Colombo' };

  assert.equal(await notifyDeletedMessage(sock, revoke, { store, config }), true);
  assert.equal(await notifyDeletedMessage(sock, revoke, { store, config }), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], '94770000000@s.whatsapp.net');
  assert.match(sent[0][1].text, /@deleter/);
  assert.match(sent[0][1].text, /@author/);
  assert.match(sent[0][1].text, /Message that was deleted/);
});

test('adds a compact, command-specific UI header to text and captions', async () => {
  const { styleCommandPayload, createCommandSocket } = require('../utils/replyStyle');
  const config = { botName: 'Tharun Bot', prefix: '.' };
  const command = { name: 'ytvideo', category: 'media' };
  const styled = styleCommandPayload({ text: 'Done' }, command, config);
  assert.match(styled.text, /^╭──〔 📹 \*\.ytvideo\* 〕\n│ 🤖 \*Tharun Bot\*\n╰──────────────────\n\nDone$/);
  assert.equal(styleCommandPayload({ audio: Buffer.from('x') }, command, config).text, undefined);

  const sent = [];
  const socket = { sendMessage: async (...args) => sent.push(args) };
  await createCommandSocket(socket, command, config).sendMessage('chat@s.whatsapp.net', { caption: 'Ready' });
  assert.match(sent[0][1].caption, /\.ytvideo/);
});
