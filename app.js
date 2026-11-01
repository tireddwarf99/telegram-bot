const http = require('node:http');
const crypto = require('node:crypto');
const { extractTikTokUrl } = require('./utils/tiktokUrl');

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

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
  const publicBaseUrl = process.env?.RENDER_EXTERNAL_URL;
  const webhookMode = Boolean(publicBaseUrl);
  const webhookSecret = webhookMode
    ? (process.env.TELEGRAM_WEBHOOK_SECRET ||
      crypto.createHmac('sha256', process.env.TELEGRAM_API).update('render-telegram-webhook').digest('hex'))
    : null;

  bot.on('message', (msg) => {
    if (stopping) return;
    const task = handler(bot, msg).catch((error) => console.error('[Bot] Message handling failed', { code: error.code }));
    pending.add(task);
    task.finally(() => pending.delete(task));
  });

  const server = http.createServer((req, res) => {
    const requestPath = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && (requestPath === '/health' || requestPath === '/')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }
    if (!webhookMode || req.method !== 'POST' || requestPath !== '/telegram') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const suppliedSecret = Buffer.from(req.headers['x-telegram-bot-api-secret-token'] || '');
    const expectedSecret = Buffer.from(webhookSecret);
    if (suppliedSecret.length !== expectedSecret.length || !crypto.timingSafeEqual(suppliedSecret, expectedSecret)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (stopping) {
      res.writeHead(503);
      res.end('Service shutting down');
      return;
    }

    let bytes = 0;
    const chunks = [];
    let tooLarge = false;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_WEBHOOK_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        res.writeHead(413);
        res.end('Payload too large');
        return;
      }
      let update;
      try {
        update = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!update || typeof update.update_id !== 'number') throw new Error('Invalid update');
      } catch {
        res.writeHead(400);
        res.end('Invalid update');
        return;
      }
      try {
        bot.processUpdate(update);
        res.writeHead(200);
        res.end('OK');
      } catch (error) {
        console.error('[Bot] Could not process webhook update', { code: error.code });
        res.writeHead(500);
        res.end('Update failed');
      }
    });
  });

  server.listen(port, () => {
    console.log(`${logPrefix}Health server listening on port ${port}`);
    if (!webhookMode) return;
    const webhookUrl = new URL('/telegram', publicBaseUrl).href;
    bot.setWebHook(webhookUrl, { secret_token: webhookSecret }).then(() => {
      console.log(`${logPrefix}Telegram webhook registered`);
    }).catch((error) => {
      console.error('[Bot] Could not register Telegram webhook', { code: error.code });
      server.close(() => process.exit(1));
    });
  });

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    try {
      if (webhookMode) {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      } else {
        await bot.stopPolling({ cancel: true });
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
      await Promise.allSettled([...pending]);
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
