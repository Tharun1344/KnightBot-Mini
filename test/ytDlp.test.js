const test = require('node:test');
const assert = require('node:assert/strict');
const { validateYouTubeUrl, validatePublicMediaUrl } = require('../utils/ytDlp');

test('accepts canonical YouTube watch and short URLs', () => {
  assert.match(validateYouTubeUrl('https://www.youtube.com/watch?v=abcdefghijk'), /youtube\.com/);
  assert.match(validateYouTubeUrl('https://youtu.be/abcdefghijk'), /youtu\.be/);
});

test('rejects non-YouTube URLs before invoking yt-dlp', () => {
  assert.throws(() => validateYouTubeUrl('https://example.com/file.mp4'), /Only YouTube URLs/);
  assert.throws(() => validateYouTubeUrl('not a URL'), /Invalid YouTube URL/);
});

test('public-media fallback only accepts supported social domains', () => {
  assert.match(validatePublicMediaUrl('https://www.tiktok.com/@user/video/123'), /tiktok\.com/);
  assert.match(validatePublicMediaUrl('https://www.instagram.com/reel/example/'), /instagram\.com/);
  assert.throws(() => validatePublicMediaUrl('https://example.org/anything'), /not supported/);
});
