const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { sendVideo, MAX_VIDEO_BYTES } = require('./sendVideo');

const run = promisify(execFile);
const binary = process.env.YT_DLP_PATH || path.join(__dirname, '..', 'bin', 'yt-dlp');

async function sendShortsWithYtDlp(bot, chatId, videoId) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid YouTube video ID');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shorts-'));
  const videoPath = path.join(dir, 'shorts.mp4');
  try {
    console.info('[YouTube] Trying yt-dlp fallback');
    try {
      await run(binary, [
        '--no-playlist', '--no-config', '--no-progress',
        '--socket-timeout', '20', '--retries', '2',
        '--max-filesize', '50M',
        '-f', 'best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4][vcodec!=none][acodec!=none]',
        '-o', videoPath,
        'https://www.youtube.com/watch?v=' + videoId,
      ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    } catch (error) {
      const stderr = String(error.stderr || '');
      console.error('[YouTube] yt-dlp failed', {
        code: error.code,
        reason: /403|Forbidden/i.test(stderr) ? 'http_403'
          : /Requested format is not available/i.test(stderr) ? 'format_unavailable'
          : /Sign in|bot/i.test(stderr) ? 'authentication_required' : 'download_failed',
      });
      error.stage = 'yt_dlp';
      throw error;
    }
    const { size } = await fs.stat(videoPath);
    if (!size || size > MAX_VIDEO_BYTES) {
      const error = new Error('yt-dlp video exceeds the Telegram upload limit');
      error.code = 'VIDEO_TOO_LARGE';
      throw error;
    }
    console.info('[YouTube] yt-dlp downloaded MP4', { bytes: size });
    return await sendVideo(bot, chatId, videoPath, 'youtube.mp4');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { sendShortsWithYtDlp };
