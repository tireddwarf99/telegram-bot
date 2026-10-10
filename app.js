const http = require('node:http');
const { extractTikTokUrl } = require('./utils/tiktokUrl');

function createMessageHandler(handlers) {
  handlers ||= {
    instagram: require('./controllers/instagramController').handleInstagram,
    tiktok: require('./controllers/tiktokController').handleTikTok,
    youtube: require('./controllers/youtubeController').handleYoutubeShorts,
    trap: require('./controllers/trapController').handleTrap,
  };
  return async (bot, msg) => {
    const text = typeof msg.text === 'string' ? msg.text : '';
    try {
      if (text.includes('https://www.instagram.com/')) await handlers.instagram(bot, msg);
      else if (extractTikTokUrl(text)) await handlers.tiktok(bot, msg);
      else if (text.includes('youtube.com/shorts') || text.includes('youtu.be')) await handlers.youtube(bot, msg);
      else if (text === '/trap') await handlers.trap(bot, msg);
    } catch {
      await bot.sendMessage(msg.chat.id, 'поломал теперь чини сам хуесос');
    }
  };
}

function startBot(bot, { port = 3000, logPrefix = '' } = {}) {
  const handler = createMessageHandler();
  const pending = new Set();
  let stopping = false;
  bot.on('message', (msg) => {
    if (stopping) return;
    const task = handler(bot, msg).catch((error) => console.error('[Bot] Message handling failed', { code: error.code }));
    pending.add(task);
    task.finally(() => pending.delete(task));
  });

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(port, () => console.log(`${logPrefix}Health server listening on port ${port}`));

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    try {
      await bot.stopPolling({ cancel: true });
      await Promise.allSettled([...pending]);
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      clearTimeout(deadline);
      process.exit(0);
    } catch (error) {
      console.error('[Bot] Shutdown failed', { code: error.code });
      process.exit(1);
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

module.exports = { createMessageHandler, startBot };
