const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createMessageHandler } = require('../app');

test('routes every supported platform in both bot configurations', async () => {
  const calls = [];
  const handlers = Object.fromEntries(['instagram', 'tiktok', 'youtube', 'trap'].map(name =>
    [name, async (bot, msg) => calls.push([name, msg.text])]));
  const handle = createMessageHandler(handlers);
  for (const [text, expected] of [
    ['https://www.instagram.com/p/abc/', 'instagram'],
    ['https://www.tiktok.com/@user/video/1', 'tiktok'],
    ['https://www.tt.site/t/abc/', 'tiktok'],
    ['https://www.youtube.com/shorts/abc', 'youtube'],
    ['https://youtu.be/abc', 'youtube'],
    ['/trap', 'trap'],
  ]) {
    await handle({}, { text, chat: { id: 1 } });
    assert.deepEqual(calls.at(-1), [expected, text]);
  }
  await handle({}, { chat: { id: 1 }, photo: [{}] });
  await handle({}, { text: '/stats', chat: { id: 1 } });
  assert.equal(calls.length, 6);
});

test('keeps the existing reply when a handler rejects', async () => {
  const replies = [];
  const handle = createMessageHandler({ trap: async () => { throw new Error('failed'); } });
  await handle({ sendMessage: async (...args) => replies.push(args) }, { text: '/trap', chat: { id: 42 } });
  assert.deepEqual(replies, [[42, 'поломал теперь чини сам хуесос']]);
});

test('keeps health checks and drains active work when stopping polling', async () => {
  let requestHandler;
  let closed = false;
  let cleared = false;
  let finishVideo;
  let stopCalls = 0;
  const exits = [];
  const processMock = new EventEmitter();
  processMock.exit = (code) => exits.push(code);
  const bot = new EventEmitter();
  bot.stopPolling = async (options) => { assert.equal(options.cancel, true); stopCalls += 1; };
  bot.sendMessage = async () => {};
  const server = {
    listen: (port, callback) => { assert.equal(port, 3001); callback(); },
    close: (callback) => { closed = true; callback(); },
  };
  const modules = {
    'node:http': { createServer: (callback) => { requestHandler = callback; return server; } },
    './utils/tiktokUrl': require('../utils/tiktokUrl'),
    './controllers/instagramController': { handleInstagram: async () => {} },
    './controllers/tiktokController': { handleTikTok: () => new Promise((resolve) => { finishVideo = resolve; }) },
    './controllers/youtubeController': { handleYoutubeShorts: async () => {} },
    './controllers/trapController': { handleTrap: async () => {} },
  };
  const context = {
    module: { exports: {} }, process: processMock, console: { log() {}, error() {} },
    require: (name) => { assert.ok(name in modules); return modules[name]; },
    setTimeout: (callback, timeout) => { assert.equal(timeout, 25000); return { unref() {} }; },
    clearTimeout: () => { cleared = true; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  context.module.exports.startBot(bot, { port: 3001 });
  for (const [url, expectedStatus, expectedBody] of [['/health', 200, 'OK'], ['/missing', 404, 'Not found']]) {
    let status;
    let body;
    requestHandler({ url }, { writeHead: (code) => { status = code; }, end: (text) => { body = text; } });
    assert.equal(status, expectedStatus);
    assert.equal(body, expectedBody);
  }
  bot.emit('message', { text: 'https://tt.site/t/abc/', chat: { id: 42 } });
  const shutdown = processMock.listeners('SIGTERM')[0];
  const done = shutdown();
  assert.equal(stopCalls, 1);
  assert.equal(closed, false, 'active video delivery must finish before shutdown');
  finishVideo();
  await done;
  await shutdown();
  assert.equal(stopCalls, 1);
  assert.equal(closed, true);
  assert.equal(cleared, true);
  assert.deepEqual(exits, [0]);
});
