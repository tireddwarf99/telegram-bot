const { downloadShorts } = require('../services/apifyShortsService');
const { sendVideo, VIDEO_TOO_LARGE_MESSAGE } = require('../utils/sendVideo');
const { deleteOriginalMessage } = require('../utils/media');

function extractYoutubeId(text) {
  const m = String(text || '').match(/(?:youtube\.com\/shorts\/|youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function handleYoutubeShorts(bot, msg) {
  const chatId = msg.chat.id;
  try {
    const id = extractYoutubeId(msg.text);
    if (!id) {
      await bot.sendMessage(chatId, 'НЕВЕРНАЯ ССЫЛКА НА YOUTUBE');
      return;
    }
    const url = await downloadShorts(id);
    await sendVideo(bot, chatId, url, 'youtube.mp4');
    await deleteOriginalMessage(bot, msg);
  } catch (error) {
    console.error('[YouTube] Apify error', {
      stage: error.stage, code: error.code, status: error.response?.status,
      message: error.message
    });
    await bot.sendMessage(chatId, error.code === 'VIDEO_TOO_LARGE'
      ? VIDEO_TOO_LARGE_MESSAGE : 'БЛЯДЬ ОШИБИЩА ВЫЛЕЗЛА ПРИ СКАЧКЕ ШОРТСА');
  }
}

module.exports = { handleYoutubeShorts, extractYoutubeId };
