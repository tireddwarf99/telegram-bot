const delay = require('../utils/delay');
const { extractTikTokUrl, resolveTikTokUrl } = require('../utils/tiktokUrl');
const { getTikTokMedia } = require('../services/tiktokService');
const { sendVideo, VIDEO_TOO_LARGE_MESSAGE } = require('../utils/sendVideo');
const { sendPhotoAlbum, deleteOriginalMessage } = require('../utils/media');

const handleTikTok = async (bot, msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  try {
    const inputUrl = extractTikTokUrl(text);
    const videoUrl = await resolveTikTokUrl(inputUrl);
    const media = await getTikTokMedia(videoUrl);
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
    console.error('[TikTok] Download or delivery failed', { status: err.response?.status, code: err.code });
    await bot.sendMessage(chatId, err.code === 'VIDEO_TOO_LARGE' ? VIDEO_TOO_LARGE_MESSAGE :
      'ДАУН ТЫ ЧТО ПОРНО КАЧАТЬ СОБРАЛСЯ???????? НАХУЯ ТАКОЕ БОЛЬШОЕ ВИДЕО ТЕБЕ, НЕ КИДАЙ МНЕ ТАКОЕ БОЛЬШЕ! ОНО БОЛЬШЕ 50 МБ, ЗАДУМАЙСЯ');
  }
};

module.exports = { handleTikTok };
