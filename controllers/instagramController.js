const { instaScrapper } = require('../services/instagramService');
const { sendVideo, VIDEO_TOO_LARGE_MESSAGE } = require('../utils/sendVideo');
const { deleteOriginalMessage } = require('../utils/media');

const handleInstagram = async (bot, msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  try {
    const post = await instaScrapper(text);
    if (post && post.length > 0) {
      for (const media of post) {
        if (media.type === 'image') {
          await bot.sendPhoto(chatId, media.link);
        } else if (media.type === 'video') {
          await sendVideo(bot, chatId, media.link, 'instagram.mp4');
        } else {
          await bot.sendMessage(chatId, 'пошёл на хуй');
        }
      }
    } else {
      await bot.sendMessage(chatId, 'ну и зачем ты это скинул????????? ТУТ НИХУЯ');
    }
    
    await deleteOriginalMessage(bot, msg);
  } catch (err) {
    console.error('[Instagram] Download or delivery failed', { code: err.code, status: err.response?.status });
    await bot.sendMessage(chatId, err.code === 'VIDEO_TOO_LARGE' ? VIDEO_TOO_LARGE_MESSAGE :
      'Произошла ошибка: ты родился и высрал эту хуйню мне в чат');
  }
};

module.exports = { handleInstagram };
