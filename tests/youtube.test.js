const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractYoutubeId } = require('../controllers/youtubeController');
const { downloadShorts, getDownloadRequest, getDownloadUrl } = require('../services/socialkitShortsService');

test('extracts Shorts ID', () => {
  assert.equal(extractYoutubeId('https://www.youtube.com/shorts/Q2fJy9t0fpE'), 'Q2fJy9t0fpE');
  assert.equal(extractYoutubeId('https://youtu.be/Q2fJy9t0fpE'), 'Q2fJy9t0fpE');
});

test('SocialKit v2 requests 1080p MP4 and limits Shorts duration', () => {
  assert.deepEqual(getDownloadRequest('Q2fJy9t0fpE'), {
    url: 'https://www.youtube.com/shorts/Q2fJy9t0fpE',
    format: 'mp4', quality: '1080p', max_duration: 180
  });
});

test('v2 ready response provides download URL and rejects oversized uploads', () => {
  assert.equal(getDownloadUrl({ success: true, data: {
    status: 'ready', downloadUrl: 'https://files.example/video.mp4',
    fileSizeMB: '39.15 MB'
  } }), 'https://files.example/video.mp4');
  assert.throws(() => getDownloadUrl({ success: true, data: {
    status: 'ready', downloadUrl: 'https://files.example/video.mp4', fileSizeMB: '51 MB'
  } }), { code: 'VIDEO_TOO_LARGE' });
});

test('v2 starts a job, polls processing, and returns the ready URL', async () => {
  const old = process.env.SOCIALKIT_ACCESS_KEY;
  process.env.SOCIALKIT_ACCESS_KEY = 'test-key';
  const calls = [];
  const http = {
    post: async (url, input, options) => {
      calls.push(['post', url, input, options.headers['x-access-key']]);
      return { data: { success: true, data: { jobId: 'abc123', status: 'queued' } } };
    },
    get: async (url) => {
      calls.push(['get', url]);
      return { data: { success: true, data: calls.filter(c => c[0] === 'get').length === 1
        ? { status: 'processing' }
        : { status: 'ready', downloadUrl: 'https://files.example/video.mp4' } } };
    }
  };
  try {
    assert.equal(await downloadShorts('Q2fJy9t0fpE', { http, sleep: async () => {}, maxPolls: 3 }),
      'https://files.example/video.mp4');
    assert.equal(calls[0][1], 'https://api.socialkit.dev/v2/youtube/download');
    assert.equal(calls[1][1], 'https://api.socialkit.dev/v2/downloads/abc123');
    assert.equal(calls.length, 3);
  } finally {
    if (old === undefined) delete process.env.SOCIALKIT_ACCESS_KEY;
    else process.env.SOCIALKIT_ACCESS_KEY = old;
  }
});

test('v2 stops on a failed job', async () => {
  const old = process.env.SOCIALKIT_ACCESS_KEY;
  process.env.SOCIALKIT_ACCESS_KEY = 'test-key';
  try {
    const http = {
      post: async () => ({ data: { success: true, data: { jobId: 'abc123' } } }),
      get: async () => ({ data: { success: true, data: { status: 'failed', error: 'video unavailable' } } })
    };
    await assert.rejects(downloadShorts('Q2fJy9t0fpE', { http, sleep: async () => {}, maxPolls: 1 }),
      { stage: 'socialkit_job' });
  } finally {
    if (old === undefined) delete process.env.SOCIALKIT_ACCESS_KEY;
    else process.env.SOCIALKIT_ACCESS_KEY = old;
  }
});
