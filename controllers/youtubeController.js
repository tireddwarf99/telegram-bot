const { sendShortsWithYtDlp } = require('../utils/youtubeFallback');
const { VIDEO_TOO_LARGE_MESSAGE } = require('../utils/sendVideo');
const { deleteOriginalMessage } = require('../utils/media');

async function handleYoutubeShorts(bot, msg) {
  const chatId = msg.chat.id;
  try {
    const videoId = extractYoutubeId(msg.text || '');
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      await bot.sendMessage(chatId, 'НЕВЕРНАЯ ССЫЛКА НА YOUTUBE');
      return;
    }
    await sendShortsWithYtDlp(bot, chatId, videoId);
    await deleteOriginalMessage(bot, msg);
  } catch (err) {
    console.error('YouTube Shorts error:', {
      code: err.code, stage: err.stage, message: err.message,
    });
    await bot.sendMessage(chatId, err.code === 'VIDEO_TOO_LARGE'
      ? VIDEO_TOO_LARGE_MESSAGE : 'БЛЯДЬ ОШИБИЩА ВЫЛЕЗЛА ПРИ СКАЧКЕ ШОРТСА');
  }
}

function extractYoutubeId(text) {
  const match = text.match(/(?:youtube\.com\/shorts\/|youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/);
  return match?.[1] || null;
}

module.exports = { handleYoutubeShorts, extractYoutubeId };
