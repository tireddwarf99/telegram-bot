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
    return await bot.sendMessage(chatId, LARGE_VIDEO_MESSAGE);
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

function tooLargeError(bytes, source) {
  const error = new Error('Video exceeds the Telegram upload limit');
  error.code = 'VIDEO_TOO_LARGE';
  error.videoBytes = bytes;
  error.limitBytes = MAX_VIDEO_BYTES;
  error.sizeSource = source;
  return error;
}

async function sendVideo(bot, chatId, media, filename = 'video.mp4') {
  let notification;
  let notified = false;
  const notifyIfLarge = async () => {
    if (notified) return;
    notified = true;
    notification = await notifyLargeVideo(bot, chatId);
  };
  try {
    return await sendVideoWithNotice(bot, chatId, media, filename, notifyIfLarge);
  } finally {
    if (notification?.message_id !== undefined) {
      try {
        await bot.deleteMessage(chatId, notification.message_id);
      } catch (error) {
        // The video result must not be changed by notification cleanup failure.
        console.warn('[Video] Could not delete wait notification', { code: error.code });
      }
    }
  }
}

async function sendVideoWithNotice(bot, chatId, media, filename, notifyIfLarge) {
  const fileOptions = { filename, contentType: 'video/mp4' };
  if (Buffer.isBuffer(media)) {
    if (media.length > MAX_VIDEO_BYTES) throw tooLargeError(media.length, 'buffer');
    if (media.length > URL_VIDEO_BYTES) await notifyIfLarge();
    return withUploadStatus(bot, chatId, () => uploadVideoFile(bot, chatId, media, fileOptions));
  }

  let sizeError;
  try {
    return await bot.sendVideo(chatId, media);
  } catch (error) {
    const status = error.response?.body?.error_code ?? error.response?.statusCode;
    const description = error.response?.body?.description || error.message || '';
    sizeError = /file (?:is )?too (?:big|large)|request entity too large/i.test(description);
    const urlError = /failed to get HTTP URL content|wrong file identifier\/HTTP URL specified|wrong type of the web page content/i.test(description);
    const isUrl = typeof media === 'string' && /^https?:\/\//i.test(media);
    if (error.code !== 'ETELEGRAM' || ![400, 413].includes(status) || !isUrl || (!sizeError && !urlError)) {
      error.stage = 'telegram_url';
      throw error;
    }
    console.warn('[Video] Telegram could not fetch URL; trying file upload', { reason: sizeError ? 'size_limit' : 'url_fetch' });
  }

  if (sizeError) await notifyIfLarge();
  return withUploadStatus(bot, chatId, () => downloadAndUpload(bot, chatId, media, fileOptions, notifyIfLarge));
}

async function uploadVideoFile(bot, chatId, media, fileOptions) {
  try {
    return await bot.sendVideo(chatId, media, {}, fileOptions);
  } catch (error) {
    error.stage = 'telegram_upload';
    throw error;
  }
}

async function downloadAndUpload(bot, chatId, media, fileOptions, notifyIfLarge) {
  // Download after Telegram rejects the URL because of size or URL accessibility.
  // Stream to disk so concurrent downloads do not each use 50 MB of RAM.
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'telegram-video-'));
  const videoPath = path.join(directory, 'video.mp4');
  let response;
  try {
    response = await axios.get(media, {
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Encoding': 'identity',
      },
    });
    if (Number(response.headers['content-length']) > MAX_VIDEO_BYTES) {
      throw tooLargeError(Number(response.headers['content-length']), 'content_length');
    }
    if (Number(response.headers['content-length']) > URL_VIDEO_BYTES) await notifyIfLarge();
    let bytes = 0;
    const sizeLimit = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        callback(bytes > MAX_VIDEO_BYTES ? tooLargeError(bytes, 'downloaded_bytes') : null, chunk);
      },
    });
    await pipeline(response.data, sizeLimit, fs.createWriteStream(videoPath));
    if (bytes > URL_VIDEO_BYTES) await notifyIfLarge();
    console.info('[Video] Uploading downloaded file', { bytes });
    return await uploadVideoFile(bot, chatId, videoPath, fileOptions);
  } catch (error) {
    error.stage ||= 'video_download';
    throw error;
  } finally {
    response?.data.destroy();
    await fs.promises.rm(videoPath, { force: true });
    await fs.promises.rmdir(directory);
  }
}

module.exports = { sendVideo, MAX_VIDEO_BYTES, VIDEO_TOO_LARGE_MESSAGE, LARGE_VIDEO_MESSAGE };
