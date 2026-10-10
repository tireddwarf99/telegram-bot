const delay = require('../utils/delay');
const { extractTikTokUrl, resolveTikTokUrl } = require('../utils/tiktokUrl');
const { getTikTokMedia, getFxTikTokMedia } = require('../services/tiktokService');
const { sendVideo, VIDEO_TOO_LARGE_MESSAGE } = require('../utils/sendVideo');
const { sendPhotoAlbum, deleteOriginalMessage } = require('../utils/media');

const handleTikTok = async (bot, msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;
  let stage = 'resolve_url';

  try {
    const inputUrl = extractTikTokUrl(text);
    const videoUrl = await resolveTikTokUrl(inputUrl);
    stage = 'get_media';
    const media = await getTikTokMedia(videoUrl);
    stage = 'send_media';
    if (media.images && media.images.length) {
      await sendPhotoAlbum(bot, chatId, media.images);
    } else if (media.play) {
      await delay(700);
      try {
        await sendVideo(bot, chatId, media.play, 'tiktok.mp4');
      } catch (error) {
        // Different sources can provide different encodings of the same post.
        if (error.code !== 'VIDEO_TOO_LARGE' || Buffer.isBuffer(media.play)) throw error;
        console.warn('[TikTok] TikWM video exceeds upload limit; trying fxTikTok', {
          bytes: error.videoBytes, limitBytes: error.limitBytes, sizeSource: error.sizeSource,
        });
        stage = 'get_fallback_media';
        const fallback = await getFxTikTokMedia(videoUrl);
        stage = 'send_fallback_media';
        await sendVideo(bot, chatId, fallback.play, 'tiktok.mp4');
      }
    } else {
      await bot.sendMessage(chatId, 'НОУ ВИДЕОС ДЛЯ ТЕБЯ');
    }

    await deleteOriginalMessage(bot, msg);
  } catch (err) {
    const description = err.response?.body?.description;
    console.error('[TikTok] Download or delivery failed', {
      stage: err.stage || stage,
      status: err.response?.status ?? err.response?.statusCode ?? err.response?.body?.error_code,
      code: err.code,
      bytes: err.videoBytes,
      limitBytes: err.limitBytes,
      sizeSource: err.sizeSource,
      description: typeof description === 'string' ? description.replace(/https?:\/\/\S+/gi, '[URL]').slice(0, 250) : undefined,
    });
    await bot.sendMessage(chatId, err.code === 'VIDEO_TOO_LARGE' ? VIDEO_TOO_LARGE_MESSAGE :
      'поломал теперь чини сам хуесос');
  }
};

module.exports = { handleTikTok };
