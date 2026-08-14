const { instaScrapper } = require('../services/instagramService');

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
          await bot.sendVideo(chatId, media.link);
        } else {
          await bot.sendMessage(chatId, 'пошёл на хуй');
        }
      }
    } else {
      await bot.sendMessage(chatId, 'ну и зачем ты это скинул????????? ТУТ НИХУЯ');
    }
    
    await bot.deleteMessage(msg.chat.id, msg.message_id);
  } catch (err) {
    console.log(err);
    await bot.sendMessage(chatId, 'Произошла ошибка: ты родился и высрал эту хуйню мне в чат');
  }
};

module.exports = { handleInstagram };