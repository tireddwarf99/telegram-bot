const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const axios = require('axios');
const { sendVideo, MAX_VIDEO_BYTES, LARGE_VIDEO_MESSAGE } = require('../utils/sendVideo');

const originalGet = axios.get;
const originalMkdtemp = fs.promises.mkdtemp;
let directories;
beforeEach(() => {
  directories = [];
  fs.promises.mkdtemp = async (...args) => {
    const directory = await originalMkdtemp(...args);
    directories.push(directory);
    return directory;
  };
});
afterEach(() => {
  axios.get = originalGet;
  fs.promises.mkdtemp = originalMkdtemp;
  for (const directory of directories) assert.equal(fs.existsSync(directory), false, 'temporary directory must be removed');
});

function responseOfSize(bytes, headers = {}) {
  const chunk = Buffer.alloc(1024 * 1024, 1);
  return {
    headers,
    data: Readable.from((function* () {
      let remaining = bytes;
      while (remaining > 0) {
        const length = Math.min(remaining, chunk.length);
        yield chunk.subarray(0, length);
        remaining -= length;
      }
    })()),
  };
}

function uploadBot(onUpload = async () => {}, description = 'Bad Request: file is too big') {
  const events = [];
  return { events,
    sendMessage: async (...args) => events.push(['message', ...args]),
    sendChatAction: async (...args) => events.push(['action', ...args]),
    sendVideo: async (...args) => {
    if (typeof args[1] === 'string' && args[1].startsWith('https://')) {
      const error = new Error('ETELEGRAM: 400 Bad Request: file is too big');
      error.code = 'ETELEGRAM';
      error.response = { body: { error_code: 400, description } };
      throw error;
    }
    return onUpload(...args);
  } };
}

test('sends ordinary videos by URL without downloading or creating files', async () => {
  axios.get = async () => assert.fail('small videos must not be downloaded');
  const calls = [];
  const bot = { sendVideo: async (...args) => { calls.push(args); return { message_id: 8 }; } };
  assert.deepEqual(await sendVideo(bot, 42, 'https://example.com/small.mp4'), { message_id: 8 });
  assert.deepEqual(calls, [[42, 'https://example.com/small.mp4']]);
  assert.equal(directories.length, 0);
});

test('does not download on unrelated Telegram errors or network failures', async () => {
  axios.get = async () => assert.fail('must not download for unrelated errors');
  for (const [code, status, description] of [
    ['ETELEGRAM', 400, 'Bad Request: chat not found'],
    ['ETELEGRAM', 403, 'Forbidden: bot was blocked by the user'],
    ['ETELEGRAM', 429, 'Too Many Requests'],
    ['EFATAL', undefined, 'Connection timed out'],
  ]) {
    const error = new Error(description);
    error.code = code;
    error.response = { body: { error_code: status, description } };
    const bot = { sendVideo: async () => { throw error; } };
    await assert.rejects(sendVideo(bot, 42, 'https://example.com/video.mp4'), (caught) => caught === error);
  }
  assert.equal(directories.length, 0);
});

test('downloads a video larger than 20 MB and uploads a local file', async () => {
  const bytes = 21 * 1024 * 1024;
  axios.get = async (url, options) => {
    assert.equal(url, 'https://example.com/video.mp4');
    assert.equal(options.responseType, 'stream');
    return responseOfSize(bytes);
  };
  let sentPath;
  const bot = uploadBot(async (chatId, file, options, fileOptions) => {
    assert.equal(chatId, 42);
    assert.equal(fs.statSync(file).size, bytes);
    assert.equal(fileOptions.filename, 'tiktok.mp4');
    sentPath = file;
    return { message_id: 7 };
  });
  assert.deepEqual(await sendVideo(bot, 42, 'https://example.com/video.mp4', 'tiktok.mp4'), { message_id: 7 });
  assert.equal(fs.existsSync(sentPath), false);
  assert.deepEqual(bot.events, [
    ['message', 42, LARGE_VIDEO_MESSAGE],
    ['action', 42, 'upload_video'],
  ]);
});

test('accepts a file exactly at the 50 MB upload boundary', async () => {
  axios.get = async () => responseOfSize(MAX_VIDEO_BYTES);
  const bot = uploadBot(async (chatId, file) => {
    assert.equal(fs.statSync(file).size, MAX_VIDEO_BYTES);
  });
  await sendVideo(bot, 42, 'https://example.com/video.mp4');
});

test('uploads the 37.69 MB video when Telegram reports a generic URL fetch error', async () => {
  const bytes = 39518066;
  axios.get = async () => responseOfSize(bytes, { 'content-length': String(bytes) });
  for (const description of [
    'Bad Request: failed to get HTTP URL content',
    'Bad Request: wrong file identifier/HTTP URL specified',
    'Bad Request: wrong type of the web page content',
  ]) {
    let uploads = 0;
    const bot = uploadBot(async (chat, file) => {
      assert.equal(fs.statSync(file).size, bytes);
      uploads += 1;
    }, description);
    await sendVideo(bot, 42, 'https://example.com/video.mp4');
    assert.equal(uploads, 1);
    assert.equal(bot.events.filter(event => event[0] === 'message').length, 1);
    assert.equal(bot.events.find(event => event[0] === 'message')[2], LARGE_VIDEO_MESSAGE);
  }
});

test('URL fetch errors for small videos do not produce a false 20 MB wait message', async () => {
  axios.get = async () => responseOfSize(100);
  const bot = uploadBot(async () => {}, 'Bad Request: failed to get HTTP URL content');
  await sendVideo(bot, 42, 'https://example.com/small.mp4');
  assert.equal(bot.events.filter(event => event[0] === 'message').length, 0);
});

test('rejects oversized downloads without trusting Content-Length', async () => {
  axios.get = async () => responseOfSize(MAX_VIDEO_BYTES + 1);
  const bot = uploadBot(async () => assert.fail('must not upload an oversized file'));
  await assert.rejects(sendVideo(bot, 42, 'https://example.com/video.mp4'), { code: 'VIDEO_TOO_LARGE' });
});

test('rejects oversized Content-Length before downloading', async () => {
  const response = responseOfSize(1, { 'content-length': String(MAX_VIDEO_BYTES + 1) });
  axios.get = async () => response;
  await assert.rejects(sendVideo(uploadBot(), 42, 'https://example.com/video.mp4'), { code: 'VIDEO_TOO_LARGE' });
  assert.equal(response.data.destroyed, true);
});

test('cleans up when Telegram rejects the upload', async () => {
  axios.get = async () => responseOfSize(100);
  const bot = uploadBot(async () => { throw new Error('Telegram upload failed'); });
  await assert.rejects(sendVideo(bot, 42, 'https://example.com/video.mp4'), /Telegram upload failed/);
});

test('cleans up when the download fails partway through', async () => {
  axios.get = async () => ({ headers: {}, data: Readable.from((function* () {
    yield Buffer.from('partial video');
    throw new Error('Download interrupted');
  })()) });
  await assert.rejects(sendVideo(uploadBot(), 42, 'https://example.com/video.mp4'), /Download interrupted/);
});

test('uploads existing buffers directly and enforces their size limit', async () => {
  axios.get = async () => assert.fail('must not download an existing buffer');
  const video = Buffer.from('video');
  const bot = { sendVideo: async (chatId, media) => assert.equal(media, video) };
  await sendVideo(bot, 42, video);
  await assert.rejects(sendVideo(bot, 42, Buffer.alloc(MAX_VIDEO_BYTES + 1)), { code: 'VIDEO_TOO_LARGE' });
  assert.equal(directories.length, 0);
});

test('large buffers get a wait message before the upload status', async () => {
  const bot = uploadBot();
  await sendVideo(bot, 42, Buffer.alloc(20 * 1024 * 1024 + 1));
  assert.deepEqual(bot.events, [
    ['message', 42, LARGE_VIDEO_MESSAGE],
    ['action', 42, 'upload_video'],
  ]);
});

test('refreshes the upload status and clears its timer on success and failure', async () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  try {
    for (const fail of [false, true]) {
      let refresh;
      let cleared = false;
      let actions = 0;
      const timer = { unref() {} };
      global.setInterval = (callback, milliseconds) => {
        assert.equal(milliseconds, 4000);
        refresh = callback;
        return timer;
      };
      global.clearInterval = (value) => { assert.equal(value, timer); cleared = true; };
      const bot = {
        sendChatAction: async (chatId, action) => {
          assert.equal(chatId, 42);
          assert.equal(action, 'upload_video');
          actions += 1;
        },
        sendVideo: async () => {
          assert.equal(actions, 1, 'status must be sent before uploading');
          await refresh();
          if (fail) throw new Error('Upload failed');
        },
      };
      const operation = sendVideo(bot, 42, Buffer.from('video'));
      if (fail) await assert.rejects(operation, /Upload failed/);
      else await operation;
      assert.equal(actions, 2);
      assert.equal(cleared, true);
    }
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test('notification and status failures do not prevent uploading the video', async () => {
  let sent = false;
  const bot = {
    sendMessage: async () => { throw new Error('Notification failed'); },
    sendChatAction: async () => { throw new Error('Status failed'); },
    sendVideo: async () => { sent = true; },
  };
  await sendVideo(bot, 42, Buffer.alloc(20 * 1024 * 1024 + 1));
  assert.equal(sent, true);
});

test('removes the wait notification after a successful file upload', async () => {
  axios.get = async () => responseOfSize(21 * 1024 * 1024);
  const events = [];
  const bot = uploadBot(async () => { events.push('uploaded'); return { message_id: 8 }; });
  bot.sendMessage = async (chatId, text) => {
    assert.equal(text, LARGE_VIDEO_MESSAGE);
    events.push('notified');
    return { message_id: 7 };
  };
  bot.deleteMessage = async (chatId, messageId) => {
    assert.equal(chatId, 42);
    assert.equal(messageId, 7);
    events.push('deleted');
  };
  assert.deepEqual(await sendVideo(bot, 42, 'https://example.com/video.mp4'), { message_id: 8 });
  assert.deepEqual(events, ['notified', 'uploaded', 'deleted']);
});

test('removes the wait notification for fallback buffers and failed uploads', async () => {
  for (const fail of [false, true]) {
    const events = [];
    const bot = {
      sendMessage: async () => { events.push('notified'); return { message_id: 7 }; },
      sendChatAction: async () => {},
      sendVideo: async () => { events.push('uploaded'); if (fail) throw new Error('Upload failed'); },
      deleteMessage: async (id, message) => { assert.equal(message, 7); events.push('deleted'); },
    };
    const operation = sendVideo(bot, 42, Buffer.alloc(20 * 1024 * 1024 + 1));
    if (fail) await assert.rejects(operation, /Upload failed/);
    else await operation;
    assert.deepEqual(events, ['notified', 'uploaded', 'deleted']);
  }
});

test('notification deletion errors do not report a successful upload as failed', async () => {
  const bot = {
    sendMessage: async () => ({ message_id: 7 }),
    sendChatAction: async () => {},
    sendVideo: async () => ({ message_id: 8 }),
    deleteMessage: async () => { throw new Error('Delete failed'); },
  };
  assert.deepEqual(await sendVideo(bot, 42, Buffer.alloc(20 * 1024 * 1024 + 1)), { message_id: 8 });
});
