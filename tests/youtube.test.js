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

// CDN expiry regression: refetch a signed MP4 link after HTTP 403.
test('controller retries once with a refreshed URL when the CDN returns 403', async () => {
  const axios = require('axios');
  const sendVideoModule = require('../utils/sendVideo');
  const mediaModule = require('../utils/media');
  const controllerPath = require.resolve('../controllers/youtubeController');
  const oldGet = axios.get;
  const oldSendVideo = sendVideoModule.sendVideo;
  const oldDelete = mediaModule.deleteOriginalMessage;
  try {
    let fetches = 0;
    const attempts = [];
    axios.get = async () => ({ data: { status: 'OK', formats: [{ mimeType: 'video/mp4', url: ++fetches === 1 ? 'https://cdn.example/expired' : 'https://cdn.example/fresh' }] } });
    sendVideoModule.sendVideo = async (bot, chatId, url) => {
      attempts.push(url);
      if (attempts.length === 1) {
        const error = new Error('Forbidden');
        error.stage = 'video_download';
        error.response = { status: 403 };
        throw error;
      }
    };
    let deleted = 0;
    mediaModule.deleteOriginalMessage = async () => { deleted++; };
    delete require.cache[controllerPath];
    const { handleYoutubeShorts } = require('../controllers/youtubeController');
    await handleYoutubeShorts({ sendMessage: async () => assert.fail('retry should succeed') }, { text: 'https://youtube.com/shorts/abc123', chat: { id: 42 }, message_id: 10 });
    assert.equal(fetches, 2);
    assert.deepEqual(attempts, ['https://cdn.example/expired', 'https://cdn.example/fresh']);
    assert.equal(deleted, 1);
  } finally {
    axios.get = oldGet;
    sendVideoModule.sendVideo = oldSendVideo;
    mediaModule.deleteOriginalMessage = oldDelete;
    delete require.cache[controllerPath];
  }
});
