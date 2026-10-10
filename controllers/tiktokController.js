const delay = require('../utils/delay');
const { extractTikTokUrl, resolveTikTokUrl } = require('../utils/tiktokUrl');
const { getTikTokMedia } = require('../services/tiktokService');

const handleTikTok = async (bot, msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  try {
    const inputUrl = extractTikTokUrl(text);
    const videoUrl = await resolveTikTokUrl(inputUrl);
    const media = await getTikTokMedia(videoUrl);
    if (media.images && media.images.length) {
      const mediaGroup = media.images.map((imageUrl) => ({ type: 'photo', media: imageUrl }));
      await bot.sendMediaGroup(chatId, mediaGroup);
    } else if (media.play) {
      await delay(700);
      if (Buffer.isBuffer(media.play)) {
        await bot.sendVideo(chatId, media.play, {}, { filename: 'tiktok.mp4', contentType: 'video/mp4' });
      } else {
        await bot.sendVideo(chatId, media.play);
      }
    } else {
      await bot.sendMessage(chatId, 'НОУ ВИДЕОС ДЛЯ ТЕБЯ');
    }

    await bot.deleteMessage(msg.chat.id, msg.message_id);
  } catch (err) {
    console.error('[TikTok] Download or delivery failed', { status: err.response?.status, code: err.code });
    await bot.sendMessage(chatId, 'Не удалось загрузить TikTok. Источник видео временно недоступен или видео нельзя отправить. Попробуй позже.');
  }
};

module.exports = { handleTikTok };
