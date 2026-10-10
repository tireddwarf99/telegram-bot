const axios = require('axios');
const delay = require('../utils/delay');
const { sendVideo, VIDEO_TOO_LARGE_MESSAGE } = require('../utils/sendVideo');
const { deleteOriginalMessage } = require('../utils/media');

const handleYoutubeShorts = async (bot, msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  try {
    const response = await axios.get('https://yt-api.p.rapidapi.com/dl', {
      params: { id: extractYoutubeId(text) },
      headers: {
        'X-RapidAPI-Key': process.env.RAPID_API_KEY_YOUTUBE,
        'X-RapidAPI-Host': process.env.RAPID_API_HOST_YOUTUBE,
      },
      timeout: 20000,
    });

    const data = response.data;
    console.log('YT API status:', data.status);

    if (data.status !== 'OK') {
      await bot.sendMessage(chatId, 'НЕ СМОГ СКАЧАТЬ ЭТОТ ШОРТС');
      return;
    }

    const videoUrl = selectVideoUrl(data);

    if (!videoUrl) {
      await bot.sendMessage(chatId, 'НЕ НАШЁЛ НОРМАЛЬНЫЙ ФОРМАТ ДЛЯ СКАЧКИ');
      return;
    }

    await delay(700);
    await sendVideo(bot, chatId, videoUrl, 'youtube.mp4');
    await deleteOriginalMessage(bot, msg);
  } catch (err) {
    console.error('YouTube Shorts error:', { code: err.code, status: err.response?.status });
    await bot.sendMessage(chatId, err.code === 'VIDEO_TOO_LARGE' ? VIDEO_TOO_LARGE_MESSAGE :
      'БЛЯДЬ ОШИБИЩА ВЫЛЕЗЛА ПРИ СКАЧКЕ ШОРТСА');
  }
};

// Извлекает video ID из разных форматов YouTube ссылок:
// https://www.youtube.com/shorts/VIDEOID
// https://youtu.be/VIDEOID
// https://www.youtube.com/watch?v=VIDEOID
function extractYoutubeId(url) {
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch) return shortsMatch[1];

  const shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortUrlMatch) return shortUrlMatch[1];

  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (watchMatch) return watchMatch[1];

  return url; // fallback — вернём как есть
}

function selectVideoUrl(data) {
  // Prefer formats with audio, then preserve the existing video-only fallback.
  for (const formats of [data.formats, data.adaptiveFormats]) {
    if (!Array.isArray(formats)) continue;
    const candidates = formats.filter((format) => format.mimeType?.includes('video/mp4') && format.url);
    candidates.sort((a, b) => (parseInt(b.qualityLabel, 10) || 0) - (parseInt(a.qualityLabel, 10) || 0));
    if (candidates.length) return candidates[0].url;
  }
  return null;
}

module.exports = { handleYoutubeShorts, selectVideoUrl, extractYoutubeId };
