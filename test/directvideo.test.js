const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const command = require('../commands/media/directvideo');

test('directvideo rejects non-HTTPS URLs and private addresses', async () => {
  assert.throws(() => command._private.validateUrl('http://example.com/video.mp4'), /HTTPS/);
  assert.equal(command._private.isPrivateAddress('127.0.0.1'), true);
  assert.equal(command._private.isPrivateAddress('10.0.0.1'), true);
  assert.equal(command._private.isPrivateAddress('::1'), true);
  assert.equal(command._private.isPrivateAddress('8.8.8.8'), false);
});

test('directvideo revalidates each redirect and downloads a bounded video buffer', async () => {
  const urls = [];
  const client = {
    get: async (url) => {
      urls.push(url);
      if (urls.length === 1) return { status: 302, headers: { location: 'https://cdn.example/video.mp4' } };
      return {
        status: 200,
        headers: { 'content-type': 'video/mp4; charset=binary', 'content-length': '4' },
        data: Readable.from([Buffer.from('test')]),
      };
    },
  };
  const checkedHosts = [];
  const result = await command._private.downloadAuthorizedVideo('https://origin.example/start', {
    client,
    resolveHost: async (hostname) => {
      checkedHosts.push(hostname);
      return { address: '93.184.216.34', family: 4 };
    },
  });

  assert.deepEqual(checkedHosts, ['origin.example', 'cdn.example']);
  assert.deepEqual(urls, ['https://origin.example/start', 'https://cdn.example/video.mp4']);
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.buffer.toString(), 'test');
});

test('directvideo refuses a response that is too large or not a video', async () => {
  await assert.rejects(() => command._private.downloadAuthorizedVideo('https://cdn.example/video', {
    client: { get: async () => ({ status: 200, headers: { 'content-type': 'text/html', 'content-length': '4' } }) },
    resolveHost: async () => ({ address: '93.184.216.34', family: 4 }),
  }), /did not return a video/);

  await assert.rejects(() => command._private.downloadAuthorizedVideo('https://cdn.example/video', {
    client: { get: async () => ({ status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(65 * 1024 * 1024) } }) },
    resolveHost: async () => ({ address: '93.184.216.34', family: 4 }),
  }), /64 MB/);
});
