const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendPhotoAlbum, deleteOriginalMessage } = require('../utils/media');

test('splits large albums into groups of ten and sends a single remainder as a photo', async () => {
  const events = [];
  const bot = {
    sendMediaGroup: async (id, group) => events.push(['album', id, group.length]),
    sendPhoto: async (id, photo) => events.push(['photo', id, photo]),
  };
  await sendPhotoAlbum(bot, 42, Array.from({ length: 21 }, (_, i) => `photo-${i}`));
  assert.deepEqual(events, [['album', 42, 10], ['album', 42, 10], ['photo', 42, 'photo-20']]);
});

test('sends a single image without an invalid one-item media group', async () => {
  const events = [];
  await sendPhotoAlbum({ sendPhoto: async (...args) => events.push(args) }, 42, ['photo']);
  assert.deepEqual(events, [[42, 'photo']]);
});

test('delete permission errors do not turn successful deliveries into upload errors', async () => {
  let attempted = false;
  await deleteOriginalMessage({ deleteMessage: async (chat, message) => {
    assert.equal(chat, 42);
    assert.equal(message, 7);
    attempted = true;
    throw new Error('No permission');
  } }, { chat: { id: 42 }, message_id: 7 });
  assert.equal(attempted, true);
});
