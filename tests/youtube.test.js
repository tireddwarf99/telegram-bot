const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractYoutubeId } = require('../controllers/youtubeController');

test('extracts 11-character YouTube IDs', () => {
  const id = 'AbC123_xY-z';
  for (const link of [
    'https://youtube.com/shorts/' + id,
    'https://youtu.be/' + id,
    'https://www.youtube.com/watch?v=' + id,
  ]) assert.equal(extractYoutubeId(link), id);
  assert.equal(extractYoutubeId('https://youtube.com/shorts/bad'), null);
});

test('YouTube handler uses yt-dlp without invoking RapidAPI', async () => {
  const fallback = require('../utils/youtubeFallback');
  const media = require('../utils/media');
  const controllerPath = require.resolve('../controllers/youtubeController');
  const original = fallback.sendShortsWithYtDlp;
  const originalDelete = media.deleteOriginalMessage;
  try {
    const calls = [];
    fallback.sendShortsWithYtDlp = async (bot, chat, id) => calls.push([chat, id]);
    media.deleteOriginalMessage = async () => calls.push(['deleted']);
    delete require.cache[controllerPath];
    const { handleYoutubeShorts } = require('../controllers/youtubeController');
    await handleYoutubeShorts({ sendMessage: () => assert.fail('should not send error') },
      { text: 'https://youtube.com/shorts/AbC123_xY-z', chat: { id: 42 }, message_id: 1 });
    assert.deepEqual(calls, [[42, 'AbC123_xY-z'], ['deleted']]);
  } finally {
    fallback.sendShortsWithYtDlp = original;
    media.deleteOriginalMessage = originalDelete;
    delete require.cache[controllerPath];
  }
});
