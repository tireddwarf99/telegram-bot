const request = require('request');
const delay = require('../utils/delay');

const handleTikTok = async (bot, msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  const reqvideourl = `https://www.tikwm.com/api/?url=${text}`;
  
  request(reqvideourl, async (error, response, body) => {
    try {
      if (error) {
        await bot.sendMessage(chatId, 'Анлак');
        return;
      }

      const json = JSON.parse(body);
      if (json.data && json.data.images) {
        const mediaGroup = json.data.images.map((imageUrl) => ({ type: 'photo', media: imageUrl }));
        await bot.sendMediaGroup(chatId, mediaGroup);
      } else if (json.data && json.data.play) {
        await delay(700);
        await bot.sendVideo(chatId, json.data.play);
      } else {
        await bot.sendMessage(chatId, 'НОУ ВИДЕОС ДЛЯ ТЕБЯ');
      }

      await bot.deleteMessage(msg.chat.id, msg.message_id);
    } catch (err) {
      await bot.sendMessage(chatId, 'БЛЯДЬ ОШИБИЩЕ ВЫЛЕЗЛО ОХУЕТЬ');
    }
  });
};

module.exports = { handleTikTok };