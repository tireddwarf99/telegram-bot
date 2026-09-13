const http = require('http');
const bot = require('./config/bot_test'); // <-- тестовый бот
const { handleInstagram } = require('./controllers/instagramController');
const { handleTikTok } = require('./controllers/tiktokController');
const { handleTrap } = require('./controllers/trapController');
const { handleYoutubeShorts } = require('./controllers/youtubeController');

// HTTP-сервер — нужен Render Web Service чтобы не засыпать
// cron-job.org пингует /health каждые 10 минут
const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`[TEST] Health server listening on port ${PORT}`);
});

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
    // YouTube Shorts обработка
    else if (text && (text.includes('youtube.com/shorts') || text.includes('youtu.be'))) {
      await handleYoutubeShorts(bot, msg);
    }
    // Обработчик команды /trap
    else if (text && text === '/trap') {
      await handleTrap(bot, msg);
    }

  } catch (error) {
    await bot.sendMessage(chatId, 'поломал теперь чини сам хуесос');
  }
});
