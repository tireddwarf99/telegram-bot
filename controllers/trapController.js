const request = require('request');

const handleTrap = async (bot, msg) => {
  const chatId = msg.chat.id;

  request('https://daniil.gay/traps/random', async (error, response, body) => {
    try {
      if (error) {
        await bot.sendMessage(chatId, 'ну блять ошибка');
        return;
      }

      const json = JSON.parse(body);
      if (json && json.url) {
        await bot.sendPhoto(chatId, json.url);
      } else {
        await bot.sendMessage(chatId, 'ОШИБКАААААААААААААААААА');
      }
    } catch (err) {
      await bot.sendMessage(chatId, 'АПИ ФЕДОТОВА НЕ РАБОТАЕТ ВАТАХЕЛ');
    }
  });
};

module.exports = { handleTrap };