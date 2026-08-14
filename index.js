const bot = require('./config/bot');
const { handleInstagram } = require('./controllers/instagramController');
const { handleTikTok } = require('./controllers/tiktokController');
const { handleTrap } = require('./controllers/trapController');

// Обработка команд и сообщений
bot.on('message', async (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  try {
    // Instagram обработка
    if (text && text.includes('https://www.instagram.com/')) {
      await handleInstagram(bot, msg);
    }
    // TikTok обработка
    else if (text && text.includes('tiktok.com')) {
      await handleTikTok(bot, msg);
    }
    // Обработчик команды /trap
    else if (text && text === '/trap') {
      await handleTrap(bot, msg);
    }

  } catch (error) {
    await bot.sendMessage(chatId, 'поломал теперь чини сам хуесос');
  }
});
