const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractYoutubeId } = require('../controllers/youtubeController');
const { getDownloadRequest, getDownloadUrl } = require('../services/socialkitShortsService');

test('extracts a valid Shorts ID', () => {
  assert.equal(extractYoutubeId('https://www.youtube.com/shorts/Q2fJy9t0fpE'), 'Q2fJy9t0fpE');
  assert.equal(extractYoutubeId('https://youtu.be/Q2fJy9t0fpE'), 'Q2fJy9t0fpE');
  assert.equal(extractYoutubeId('not a link'), null);
});

test('SocialKit requests 1080p MP4', () => {
  assert.deepEqual(getDownloadRequest('Q2fJy9t0fpE'), {
    url: 'https://www.youtube.com/shorts/Q2fJy9t0fpE',
    format: 'mp4',
    quality: '1080p'
  });
});

test('extracts SocialKit temporary video URL', () => {
  assert.equal(getDownloadUrl({ success: true, data: {
    downloadUrl: 'https://storage.example/video.mp4', fileSize: 5000000
  } }), 'https://storage.example/video.mp4');
  assert.throws(() => getDownloadUrl({ success: true, data: { downloadUrl: 'http://example.com/a' } }));
  assert.throws(() => getDownloadUrl({ success: false }));
  assert.throws(() => getDownloadUrl({ success: true, data: { downloadUrl: 'https://example.com/a', fileSize: 11000000 } }), { code: 'SOCIALKIT_FILE_TOO_LARGE' });
});
