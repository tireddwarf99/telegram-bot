async function sendPhotoAlbum(bot, chatId, images) {
  for (let index = 0; index < images.length; index += 10) {
    const batch = images.slice(index, index + 10);
    if (batch.length === 1) await bot.sendPhoto(chatId, batch[0]);
    else await bot.sendMediaGroup(chatId, batch.map((media) => ({ type: 'photo', media })));
  }
}

async function deleteOriginalMessage(bot, msg) {
  try {
    await bot.deleteMessage(msg.chat.id, msg.message_id);
  } catch (error) {
    // Delivery already succeeded; missing delete permissions are not an upload error.
    console.warn('[Bot] Could not delete original message', { code: error.code });
  }
}

module.exports = { sendPhotoAlbum, deleteOriginalMessage };
