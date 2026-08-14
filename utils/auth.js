require('dotenv').config();
const bot = require('./config/bot_test');

const isAuthorizedUser = (userId) => {
    return userId === process.env.TELEGRAM_ID_ADM;
};

const sendAccessDenied = async (bot, chatId) => {
    await bot.sendMessage(chatId, 'иди на хуй даун не пиши это больше');
};

module.exports = { isAuthorizedUser, sendAccessDenied };