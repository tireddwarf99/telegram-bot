const delay = require('../utils/delay');
const { extractTikTokUrl, resolveTikTokUrl } = require('../utils/tiktokUrl');
const { getTikTokMedia } = require('../services/tiktokService');
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
      await sendVideo(bot, chatId, media.play, 'tiktok.mp4');
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
      description: typeof description === 'string' ? description.replace(/https?:\/\/\S+/gi, '[URL]').slice(0, 250) : undefined,
    });
    await bot.sendMessage(chatId, err.code === 'VIDEO_TOO_LARGE' ? VIDEO_TOO_LARGE_MESSAGE :
      'поломал теперь чини сам хуесос');
  }
};

module.exports = { handleTikTok };
