const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractYoutubeId, selectVideoUrl } = require('../controllers/youtubeController');

test('extracts Shorts, short URLs and watch IDs', () => {
  for (const value of ['https://youtube.com/shorts/abc_123', 'https://youtu.be/abc_123', 'https://youtube.com/watch?v=abc_123']) {
    assert.equal(extractYoutubeId(value), 'abc_123');
  }
});

test('prefers MP4 with audio over a higher-resolution video-only format', () => {
  const data = { formats: [
    { mimeType: 'video/mp4', qualityLabel: '360p', url: '360' },
    { mimeType: 'video/mp4', qualityLabel: '720p', url: '720' },
    { mimeType: 'video/webm', qualityLabel: '1080p', url: 'webm' },
  ], adaptiveFormats: [{ mimeType: 'video/mp4', qualityLabel: '1080p', url: 'silent' }] };
  assert.equal(selectVideoUrl(data), '720');
  assert.equal(data.formats[0].url, '360');
});

test('preserves the video-only fallback and handles missing formats', () => {
  assert.equal(selectVideoUrl({ adaptiveFormats: [{ mimeType: 'video/mp4', url: 'fallback' }] }), 'fallback');
  assert.equal(selectVideoUrl({}), null);
});
