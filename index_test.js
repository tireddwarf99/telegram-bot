const bot = require('./config/bot_test');
const { startBot } = require('./app');

startBot(bot, { port: process.env.PORT || 3001, logPrefix: '[TEST] ' });
