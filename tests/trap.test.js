const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { handleTrap } = require('../controllers/trapController');
const originalGet = axios.get;
afterEach(() => { axios.get = originalGet; });

test('waits for the random photo to be sent', async () => {
  axios.get = async () => ({ data: JSON.stringify({ url: 'https://example.com/photo.jpg' }) });
  let sent = false;
  await handleTrap({ sendPhoto: async (id, url) => {
    assert.equal(id, 42);
    assert.equal(url, 'https://example.com/photo.jpg');
    sent = true;
  } }, { chat: { id: 42 } });
  assert.equal(sent, true);
});

test('preserves network and invalid-response error replies', async () => {
  const messages = [];
  const bot = { sendMessage: async (id, text) => messages.push(text) };
  axios.get = async () => { throw new Error('timeout'); };
  await handleTrap(bot, { chat: { id: 42 } });
  axios.get = async () => ({ data: 'invalid JSON' });
  await handleTrap(bot, { chat: { id: 42 } });
  axios.get = async () => ({ data: '{}' });
  await handleTrap(bot, { chat: { id: 42 } });
  assert.deepEqual(messages, ['ну блять ошибка', 'АПИ ФЕДОТОВА НЕ РАБОТАЕТ ВАТАХЕЛ', 'ОШИБКАААААААААААААААААА']);
});
