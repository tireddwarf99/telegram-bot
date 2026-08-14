const { isAuthorizedUser, sendAccessDenied } = require('../utils/auth');

// Функция, доступная только вам
const handlePrivateCommand = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверяем авторизацию
  if (!isAuthorizedUser(userId)) {
    await sendAccessDenied(bot, chatId);
    return;
  }

  // Если пользователь авторизован, выполняем функцию
  await bot.sendMessage(chatId, 'Привет, хозяин! �� Эта функция доступна только вам.');
  
  // Здесь ваша приватная логика
  // Например, административные команды, статистика и т.д.
};

// Другая приватная функция
const handleAdminStats = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAuthorizedUser(userId)) {
    await sendAccessDenied(bot, chatId);
    return;
  }

  // Показываем статистику только вам
  await bot.sendMessage(chatId, '�� Статистика бота:\n- Всего пользователей: X\n- Обработано ссылок: Y');
};

module.exports = { handlePrivateCommand, handleAdminStats };