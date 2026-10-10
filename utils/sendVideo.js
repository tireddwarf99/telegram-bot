const axios = require('axios');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const URL_VIDEO_BYTES = 20 * 1024 * 1024;
const LARGE_VIDEO_MESSAGE = 'ДЕБИЧ, ВИДЕО БОЛЬШЕ 20 МБ, НАДО ПОДОЖДАТЬ ТЕПЕРЬ';
const VIDEO_TOO_LARGE_MESSAGE = 'ДАУН ТЫ ЧТО ПОРНО КАЧАТЬ СОБРАЛСЯ???????? НАХУЯ ТАКОЕ БОЛЬШОЕ ВИДЕО ТЕБЕ, НЕ КИДАЙ МНЕ ТАКОЕ БОЛЬШЕ! ОНО БОЛЬШЕ 50 МБ, ЗАДУМАЙСЯ';

async function notifyLargeVideo(bot, chatId) {
  try {
    await bot.sendMessage(chatId, LARGE_VIDEO_MESSAGE);
  } catch {
    // A failed progress notification must not prevent the video upload.
  }
}

async function withUploadStatus(bot, chatId, upload) {
  let updating = false;
  const updateStatus = async () => {
    if (updating) return;
    updating = true;
    try {
      await bot.sendChatAction(chatId, 'upload_video');
    } catch {
      // Status is best effort; keep uploading if Telegram rejects it.
    } finally {
      updating = false;
    }
  };
  await updateStatus();
  const timer = setInterval(updateStatus, 4000);
  timer.unref();
  try {
    return await upload();
  } finally {
    clearInterval(timer);
  }
}

function tooLargeError() {
  const error = new Error('Video exceeds the Telegram upload limit');
  error.code = 'VIDEO_TOO_LARGE';
  return error;
}

async function sendVideo(bot, chatId, media, filename = 'video.mp4') {
  const fileOptions = { filename, contentType: 'video/mp4' };
  if (Buffer.isBuffer(media)) {
    if (media.length > MAX_VIDEO_BYTES) throw tooLargeError();
    if (media.length > URL_VIDEO_BYTES) await notifyLargeVideo(bot, chatId);
    return withUploadStatus(bot, chatId, () => bot.sendVideo(chatId, media, {}, fileOptions));
  }

  try {
    return await bot.sendVideo(chatId, media);
  } catch (error) {
    const status = error.response?.body?.error_code ?? error.response?.statusCode;
    const description = error.response?.body?.description || error.message || '';
    const sizeError = /file (?:is )?too (?:big|large)|request entity too large/i.test(description);
    if (error.code !== 'ETELEGRAM' || ![400, 413].includes(status) || !sizeError) throw error;
  }

  await notifyLargeVideo(bot, chatId);
  return withUploadStatus(bot, chatId, () => downloadAndUpload(bot, chatId, media, fileOptions));
}

async function downloadAndUpload(bot, chatId, media, fileOptions) {
  // Only upload locally after Telegram rejects the URL because of file size.
  // Stream to disk so concurrent downloads do not each use 50 MB of RAM.
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'telegram-video-'));
  const videoPath = path.join(directory, 'video.mp4');
  let response;
  try {
    response = await axios.get(media, {
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5,
    });
    if (Number(response.headers['content-length']) > MAX_VIDEO_BYTES) throw tooLargeError();
    let bytes = 0;
    const sizeLimit = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        callback(bytes > MAX_VIDEO_BYTES ? tooLargeError() : null, chunk);
      },
    });
    await pipeline(response.data, sizeLimit, fs.createWriteStream(videoPath));
    return await bot.sendVideo(chatId, videoPath, {}, fileOptions);
  } finally {
    response?.data.destroy();
    await fs.promises.rm(videoPath, { force: true });
    await fs.promises.rmdir(directory);
  }
}

module.exports = { sendVideo, MAX_VIDEO_BYTES, VIDEO_TOO_LARGE_MESSAGE, LARGE_VIDEO_MESSAGE };
