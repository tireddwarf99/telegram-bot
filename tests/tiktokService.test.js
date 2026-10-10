const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { getTikTokMedia } = require('../services/tiktokService');
const { handleTikTok } = require('../controllers/tiktokController');

const originalGet = axios.get;
afterEach(() => { axios.get = originalGet; });
const videoUrl = 'https://www.tiktok.com/@osman.vrode/video/7694346628299345159?_r=1&_t=ZS-9AQFGVisJ4W';
const downloadUrl = 'https://offload.tnktok.com/generate/video/7694346628299345159.mp4';
const mp4 = Buffer.from([0, 0, 0, 20, ...Buffer.from('ftypisom'), 0, 0, 0, 0]);

function unavailable() {
  const error = new Error('HTTP 403');
  error.response = { status: 403 };
  throw error;
}

test('falls back on HTTP 403, strips tracking parameters and downloads MP4', async () => {
  const calls = [];
  axios.get = async (url, options) => {
    calls.push(url);
    if (calls.length === 1) return unavailable();
    if (calls.length === 2) {
      assert.equal(url, 'https://tnktok.com/@osman.vrode/video/7694346628299345159');
      return { data: `<meta property="og:video" content="${downloadUrl}">` };
    }
    assert.equal(url, downloadUrl);
    assert.equal(options.responseType, 'arraybuffer');
    assert.equal(options.maxContentLength, 50 * 1024 * 1024);
    assert.equal(options.maxRedirects, 0);
    return { data: mp4 };
  };
  assert.deepEqual(await getTikTokMedia(videoUrl), { play: mp4 });
  assert.equal(calls.length, 3);
});

test('keeps TikWM as the primary source', async () => {
  let calls = 0;
  axios.get = async () => { calls += 1; return { data: { data: { play: 'https://example.com/video.mp4' } } }; };
  assert.deepEqual(await getTikTokMedia(videoUrl), { play: 'https://example.com/video.mp4' });
  assert.equal(calls, 1);
});

test('follows the offload redirect to the TikTok CDN', async () => {
  const calls = [];
  const cdnUrl = 'https://v16m-default.tiktokcdn-us.com/video.mp4';
  axios.get = async (url) => {
    calls.push(url);
    if (calls.length === 1) return unavailable();
    if (calls.length === 2) return { data: `<meta property="og:video" content="${downloadUrl}">` };
    if (calls.length === 3) return { status: 302, headers: { location: cdnUrl } };
    return { status: 200, data: mp4 };
  };
  assert.deepEqual(await getTikTokMedia(videoUrl), { play: mp4 });
  assert.deepEqual(calls.slice(2), [downloadUrl, cdnUrl]);
});

test('rejects offload redirects outside known TikTok media hosts', async () => {
  let calls = 0;
  axios.get = async () => {
    calls += 1;
    if (calls === 1) return unavailable();
    if (calls === 2) return { data: `<meta property="og:video" content="${downloadUrl}">` };
    return { status: 302, headers: { location: 'https://example.com/video.mp4' } };
  };
  await assert.rejects(getTikTokMedia(videoUrl), /host/);
  assert.equal(calls, 3);
});

test('falls back when TikWM returns no media', async () => {
  let calls = 0;
  axios.get = async () => {
    calls += 1;
    if (calls === 1) return { data: { code: -1, msg: 'Unavailable' } };
    if (calls === 2) return { data: `<meta property="og:video" content="${downloadUrl}">` };
    return { data: mp4 };
  };
  assert.deepEqual(await getTikTokMedia(videoUrl), { play: mp4 });
});

test('rejects unexpected media hosts and non-video responses', async () => {
  for (const mediaUrl of ['https://example.com/video.mp4', downloadUrl]) {
    let calls = 0;
    axios.get = async () => {
      calls += 1;
      if (calls === 1) return unavailable();
      if (calls === 2) return { data: `<meta property="og:video" content="${mediaUrl}">` };
      return { data: Buffer.from('<html>Not a video</html>') };
    };
    await assert.rejects(getTikTokMedia(videoUrl), mediaUrl === downloadUrl ? /MP4/ : /host/);
    assert.equal(calls, mediaUrl === downloadUrl ? 3 : 2);
  }
});

test('controller uploads fallback video as a file, then deletes the original message', async () => {
  axios.get = async (url) => {
    if (url === 'https://www.tt.site/t/ZSbnkuwFc/') return { headers: { location: videoUrl } };
    if (url === 'https://www.tikwm.com/api/') return unavailable();
    if (url.startsWith('https://tnktok.com/')) return { data: `<meta property="og:video" content="${downloadUrl}">` };
    return { data: mp4 };
  };
  const events = [];
  const bot = {
    sendVideo: async (...args) => events.push(['video', ...args]),
    deleteMessage: async (...args) => events.push(['delete', ...args]),
    sendMessage: async (...args) => events.push(['error', ...args]),
  };
  await handleTikTok(bot, { text: 'https://www.tt.site/t/ZSbnkuwFc/', chat: { id: 42 }, message_id: 7 });
  assert.deepEqual(events, [
    ['video', 42, mp4, {}, { filename: 'tiktok.mp4', contentType: 'video/mp4' }],
    ['delete', 42, 7],
  ]);
});

test('fallback failure preserves the original message', async () => {
  axios.get = async (url) => {
    if (url.startsWith('https://www.tt.site/')) return { headers: { location: videoUrl } };
    if (url === 'https://www.tikwm.com/api/') return unavailable();
    throw new Error('Fallback unavailable');
  };
  const events = [];
  const bot = {
    sendMessage: async () => events.push('error'),
    deleteMessage: async () => events.push('delete'),
  };
  await handleTikTok(bot, { text: 'https://www.tt.site/t/ZSbnkuwFc/', chat: { id: 42 }, message_id: 7 });
  assert.deepEqual(events, ['error']);
});
