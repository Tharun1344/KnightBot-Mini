const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { createCommandSocket } = require('../utils/replyStyle');

function loadCommandWithMocks(relativeFile, mocks) {
  const commandPath = path.resolve(__dirname, relativeFile);
  delete require.cache[commandPath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === commandPath && Object.hasOwn(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(commandPath);
  } finally {
    Module._load = originalLoad;
  }
}

const testConfig = { botName: 'Tharun Test Bot', prefix: '.', timezone: 'Asia/Colombo' };
const testMessage = { key: { remoteJid: 'test@s.whatsapp.net', id: 'incoming' } };

test('ytvideo runs without getConfigFromSocket and uses configured bot name', async () => {
  const calls = [];
  const apis = {
    getEliteProTechVideoByUrl: async () => { throw new Error('404'); },
    getYupraVideoByUrl: async () => { throw new Error('DNS'); },
    getOkatsuVideoByUrl: async () => ({ download: 'https://media.example/video.mp4', title: 'Test video' }),
  };
  const command = loadCommandWithMocks('../commands/media/video.js', {
    'yt-search': async () => ({ videos: [{ url: 'https://youtube.com/watch?v=abcdefghijk', title: 'Test video', thumbnail: 'https://img.example/thumb.jpg' }] }),
    '../../utils/api': apis,
    '../../config': testConfig,
  });
  const rawSocket = { sendMessage: async (...args) => { calls.push(args); return { key: { id: 'sent' } }; } };
  await command.execute(createCommandSocket(rawSocket, command, testConfig), testMessage, ['test', 'video']);

  const videoPayload = calls.find(([, payload]) => payload.video);
  assert.ok(videoPayload, 'video message should be sent after fallback provider succeeds');
  assert.match(videoPayload[1].caption, /Tharun Test Bot/);
  assert.match(videoPayload[1].caption, /\.ytvideo/);
  assert.equal(calls.length, 2, 'thumbnail and final video should be sent');
});

test('song accepts a direct YouTube URL without a thumbnail and sends MP3 audio', async () => {
  const calls = [];
  const audio = Buffer.from('ID3test audio bytes');
  const command = loadCommandWithMocks('../commands/media/song.js', {
    'yt-search': async () => ({ videos: [] }),
    axios: { get: async () => ({ data: audio }) },
    '../../utils/api': {
      getEliteProTechDownloadByUrl: async () => ({ download: 'https://media.example/song.mp3', title: 'Test song' }),
      getYupraDownloadByUrl: async () => { throw new Error('should not be needed'); },
      getOkatsuDownloadByUrl: async () => { throw new Error('should not be needed'); },
      getIzumiDownloadByUrl: async () => { throw new Error('should not be needed'); },
    },
    '../../utils/converter': { toAudio: async () => { throw new Error('MP3 should not need conversion'); } },
  });
  const rawSocket = { sendMessage: async (...args) => { calls.push(args); return { key: { id: 'sent' } }; } };
  await command.execute(createCommandSocket(rawSocket, command, testConfig), testMessage, ['https://youtu.be/abcdefghijk']);

  assert.match(calls[0][1].text, /Preparing audio/);
  assert.ok(calls[1][1].audio, 'audio payload should be sent');
  assert.equal(calls[1][1].mimetype, 'audio/mpeg');
  assert.match(calls[0][1].text, /\.song/);
});
