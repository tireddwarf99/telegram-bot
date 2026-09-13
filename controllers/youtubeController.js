const axios = require('axios');
const delay = require('../utils/delay');
require('dotenv').config();

const APIKey = process.env.RAPID_API_KEY_YOUTUBE;
const APIHost = process.env.RAPID_API_HOST_YOUTUBE;

const handleYoutubeShorts = async (bot, msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  try {
    const response = await axios.get('https://yt-api.p.rapidapi.com/dl', {
      params: { id: extractYoutubeId(text) },
      headers: {
        'X-RapidAPI-Key': APIKey,
        'X-RapidAPI-Host': APIHost,
      },
      timeout: 20000,
    });

    const data = response.data;
    console.log('YT API status:', data.status);

    if (data.status !== 'OK') {
      await bot.sendMessage(chatId, 'НЕ СМОГ СКАЧАТЬ ЭТОТ ШОРТС');
      return;
    }

    // Берём наилучший формат: ищем видео с аудио (adaptiveFormats с типом video/mp4)
    // или обычные форматы (formats)
    let videoUrl = null;

    // Сначала ищем в formats — они уже с аудиом
    if (data.formats && data.formats.length > 0) {
      // Берём 720p или наименьшее из доступных
      const sorted = data.formats
        .filter((f) => f.mimeType && f.mimeType.includes('video/mp4') && f.url)
        .sort((a, b) => (parseInt(b.qualityLabel) || 0) - (parseInt(a.qualityLabel) || 0));
      if (sorted.length > 0) {
        videoUrl = sorted[0].url;
      }
    }

    // Если formats пустые — fallback на adaptiveFormats (только видео, без аудио, но Telegram справляется)
    if (!videoUrl && data.adaptiveFormats && data.adaptiveFormats.length > 0) {
      const videoOnly = data.adaptiveFormats
        .filter((f) => f.mimeType && f.mimeType.includes('video/mp4') && f.url)
        .sort((a, b) => (parseInt(b.qualityLabel) || 0) - (parseInt(a.qualityLabel) || 0));
      if (videoOnly.length > 0) {
        videoUrl = videoOnly[0].url;
      }
    }

    if (!videoUrl) {
      await bot.sendMessage(chatId, 'НЕ НАШЁЛ НОРМАЛЬНЫЙ ФОРМАТ ДЛЯ СКАЧКИ');
      return;
    }

    await delay(700);
    await bot.sendVideo(chatId, videoUrl);
    await bot.deleteMessage(chatId, msg.message_id);
  } catch (err) {
    console.error('YouTube Shorts error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', JSON.stringify(err.response.data));
    }
    await bot.sendMessage(chatId, 'БЛЯДЬ ОШИБИЩА ВЫЛЕЗЛА ПРИ СКАЧКЕ ШОРТСА');
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

module.exports = { handleYoutubeShorts };
