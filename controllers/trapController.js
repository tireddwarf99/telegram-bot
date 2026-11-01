const axios = require('axios');

const handleTrap = async (bot, msg) => {
  const chatId = msg.chat.id;

  let body;
  try {
    const response = await axios.get('https://daniil.gay/traps/random', {
      timeout: 20000,
      responseType: 'text',
      validateStatus: () => true,
    });
    body = response.data;
  } catch {
    await bot.sendMessage(chatId, 'ну блять ошибка');
    return;
  }

  try {
    const json = JSON.parse(body);
    if (json && json.url) {
      await bot.sendPhoto(chatId, json.url);
    } else {
      await bot.sendMessage(chatId, 'ОШИБКАААААААААААААААААА');
    }
  } catch {
    await bot.sendMessage(chatId, 'АПИ ФЕДОТОВА НЕ РАБОТАЕТ ВАТАХЕЛ');
  }
};

module.exports = { handleTrap };
