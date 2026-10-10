const bot = require('./config/bot');
const { startBot } = require('./app');

startBot(bot, { port: process.env.PORT || 3000 });
