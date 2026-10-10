const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { extractTikTokUrl, resolveTikTokUrl } = require('../utils/tiktokUrl');
const { handleTikTok } = require('../controllers/tiktokController');

const shortUrl = 'https://www.tt.site/t/ZSbnkuwFc/';
const videoUrl = 'https://www.tiktok.com/@osman.vrode/video/7694346628299345159?_r=1&_t=ZS-9AQFGVisJ4W';
const originalGet = axios.get;
afterEach(() => { axios.get = originalGet; });

test('extracts TikTok and tt.site links from message text', () => {
  assert.equal(extractTikTokUrl(`Посмотри (${shortUrl}).`), shortUrl);
  assert.equal(extractTikTokUrl('https://tt.site/t/abc/'), 'https://tt.site/t/abc/');
  assert.equal(extractTikTokUrl('https://vm.tiktok.com/abc/'), 'https://vm.tiktok.com/abc/');
  assert.equal(extractTikTokUrl(videoUrl), videoUrl);
  for (const value of [undefined, 'tt.site', 'https://tt.site.evil.com/t/abc/', 'https://eviltiktok.com/video/1']) {
    assert.equal(extractTikTokUrl(value), null);
  }
});

test('resolves tt.site without loading the destination TikTok page', async () => {
  const calls = [];
  axios.get = async (url, options) => {
    calls.push(url);
    assert.equal(options.maxRedirects, 0);
    assert.equal(options.timeout, 10000);
    return { headers: { location: videoUrl } };
  };
  assert.equal(await resolveTikTokUrl(shortUrl), videoUrl);
  assert.deepEqual(calls, [shortUrl]);
  assert.equal(await resolveTikTokUrl(videoUrl), videoUrl);
  assert.equal(calls.length, 1);
});

test('follows relative redirects on tt.site', async () => {
  const calls = [];
  axios.get = async (url) => {
    calls.push(url);
    return { headers: { location: calls.length === 1 ? '/t/next/' : videoUrl } };
  };
  assert.equal(await resolveTikTokUrl(shortUrl), videoUrl);
  assert.deepEqual(calls, [shortUrl, 'https://www.tt.site/t/next/']);
});

test('rejects unexpected redirect destinations before requesting them', async () => {
  for (const location of ['https://example.com/', 'http://127.0.0.1/', 'ftp://www.tiktok.com/file', 'https://user:pass@www.tiktok.com/']) {
    let calls = 0;
    axios.get = async () => { calls += 1; return { headers: { location } }; };
    await assert.rejects(resolveTikTokUrl(shortUrl), /unsupported host/);
    assert.equal(calls, 1);
  }
});

test('rejects redirect loops, missing locations and timeouts', async () => {
  let calls = 0;
  axios.get = async () => { calls += 1; return { headers: { location: shortUrl } }; };
  await assert.rejects(resolveTikTokUrl(shortUrl), /Too many/);
  assert.equal(calls, 5);
  axios.get = async () => ({ headers: {} });
  await assert.rejects(resolveTikTokUrl(shortUrl), /did not return/);
  axios.get = async () => { throw new Error('timeout'); };
  await assert.rejects(resolveTikTokUrl(shortUrl), /timeout/);
});

function makeBot() {
  const events = [];
  return {
    events,
    sendMessage: async (...args) => events.push(['message', ...args]),
    sendMediaGroup: async (...args) => events.push(['photos', ...args]),
    sendVideo: async (...args) => events.push(['video', ...args]),
    deleteMessage: async (...args) => events.push(['delete', ...args]),
  };
}

test('controller sends the resolved URL to TikWM and delivers photos', async () => {
  const calls = [];
  axios.get = async (url, options) => {
    calls.push(url);
    if (url === shortUrl) return { headers: { location: videoUrl } };
    assert.equal(url, 'https://www.tikwm.com/api/');
    assert.equal(options.params.url, videoUrl);
    return { data: { data: { images: ['https://example.com/photo.jpg'] } } };
  };
  const bot = makeBot();
  await handleTikTok(bot, { text: `Видео: ${shortUrl}`, chat: { id: 42 }, message_id: 7 });
  assert.deepEqual(calls, [shortUrl, 'https://www.tikwm.com/api/']);
  assert.deepEqual(bot.events, [
    ['photos', 42, [{ type: 'photo', media: 'https://example.com/photo.jpg' }]],
    ['delete', 42, 7],
  ]);
});

test('ordinary TikTok links still deliver video', async () => {
  axios.get = async (url, options) => {
    assert.equal(url, 'https://www.tikwm.com/api/');
    assert.equal(options.params.url, videoUrl);
    return { data: { data: { play: 'https://example.com/video.mp4' } } };
  };
  const bot = makeBot();
  await handleTikTok(bot, { text: videoUrl, chat: { id: 42 }, message_id: 7 });
  assert.deepEqual(bot.events, [['video', 42, 'https://example.com/video.mp4'], ['delete', 42, 7]]);
});

test('resolution failure preserves the message and does not call TikWM', async () => {
  let calls = 0;
  axios.get = async () => { calls += 1; throw new Error('timeout'); };
  const bot = makeBot();
  await handleTikTok(bot, { text: shortUrl, chat: { id: 42 }, message_id: 7 });
  assert.equal(calls, 1);
  assert.equal(bot.events.length, 1);
  assert.equal(bot.events[0][0], 'message');
  assert.match(bot.events[0][2], /Попробуй позже/);
});
