/**
 * Send a direct HTTPS video URL supplied by the user.
 * Only use this command for video you own or are authorized to distribute.
 */

const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 64 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19));
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::' || normalized === '::1' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mappedIpv4 ? isPrivateAddress(mappedIpv4[1]) : false;
  }

  return true;
}

async function resolvePublicHost(hostname) {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!results.length || results.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('The URL points to a private or unsafe network destination.');
  }
  return results[0];
}

function validateUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Please provide a valid HTTPS direct video URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Please provide a valid HTTPS direct video URL.');
  }
  return url;
}

async function downloadAuthorizedVideo(value, dependencies = {}) {
  const client = dependencies.client || axios;
  const resolveHost = dependencies.resolveHost || resolvePublicHost;
  let url = validateUrl(value);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const resolved = await resolveHost(url.hostname);
    const response = await client.get(url.href, {
      responseType: 'stream',
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      maxContentLength: MAX_BYTES,
      maxBodyLength: MAX_BYTES,
      validateStatus: (status) => (status >= 200 && status < 300) || (status >= 300 && status < 400),
      // Keep the validated address for this request, preventing DNS rebinding between validation and connect.
      lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location || redirects === MAX_REDIRECTS) throw new Error('Too many or invalid redirects.');
      url = validateUrl(new URL(location, url).href);
      continue;
    }

    const contentType = String(response.headers['content-type'] || '').split(';', 1)[0].toLowerCase();
    if (!contentType.startsWith('video/')) throw new Error('The URL did not return a video file.');
    const lengthHeader = response.headers['content-length'];
    const length = lengthHeader === undefined ? null : Number(lengthHeader);
    if (length !== null && (!Number.isFinite(length) || length < 1 || length > MAX_BYTES)) {
      throw new Error('The video must be no larger than 64 MB.');
    }

    const chunks = [];
    let received = 0;
    for await (const chunk of response.data) {
      received += chunk.length;
      if (received > MAX_BYTES) {
        response.data.destroy();
        throw new Error('The video must be no larger than 64 MB.');
      }
      chunks.push(chunk);
    }
    if (!received || (length !== null && received !== length)) throw new Error('The video download was incomplete.');
    return { buffer: Buffer.concat(chunks), contentType };
  }

  throw new Error('Too many redirects.');
}

module.exports = {
  name: 'directvideo',
  aliases: ['sendvideo'],
  category: 'media',
  description: 'Send an authorized HTTPS direct video file',
  usage: '.directvideo <HTTPS direct video URL>',

  async execute(sock, msg, args, extra) {
    const url = args.join(' ').trim();
    if (!url) {
      return extra.reply('Usage: `.directvideo <HTTPS direct video URL>`\n\nOnly send video you own or are authorized to distribute.');
    }

    try {
      const { buffer, contentType } = await downloadAuthorizedVideo(url);
      await sock.sendMessage(extra.from, {
        video: buffer,
        mimetype: contentType,
        caption: 'Video sent.',
      }, { quoted: msg });
    } catch (error) {
      console.error('[directvideo]', error.message);
      await extra.reply(`❌ ${error.message || 'Could not download that video.'}`);
    }
  },

  _private: { isPrivateAddress, validateUrl, downloadAuthorizedVideo },
};
