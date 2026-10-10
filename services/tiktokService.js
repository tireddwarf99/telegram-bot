const axios = require('axios');
const cheerio = require('cheerio');
const { MAX_VIDEO_BYTES } = require('../utils/sendVideo');

function isMediaUrl(url) {
  const domains = ['tiktokcdn-us.com', 'tiktokcdn.com', 'tiktokv.com'];
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (url.hostname === 'offload.tnktok.com' || domains.some((domain) =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`)));
}

async function downloadFallbackVideo(initialUrl) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (!isMediaUrl(url)) throw new Error('Unexpected fxTikTok video host');
    let response;
    try {
      response = await axios.get(url.href, {
        responseType: 'arraybuffer',
        timeout: 45000,
        maxContentLength: MAX_VIDEO_BYTES,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });
    } catch (error) {
      if (error.code === 'ERR_BAD_RESPONSE' && /maxContentLength/i.test(error.message)) {
        error.code = 'VIDEO_TOO_LARGE';
      }
      throw error;
    }
    if (response.status >= 300) {
      if (!response.headers.location) throw new Error('Missing video redirect');
      url = new URL(response.headers.location, url);
      continue;
    }
    const video = Buffer.from(response.data);
    if (video.length < 12 || video.toString('ascii', 4, 8) !== 'ftyp') {
      throw new Error('fxTikTok did not return an MP4 file');
    }
    return video;
  }
  throw new Error('Too many video redirects');
}

async function getTikTokMedia(videoUrl) {
  try {
    const { data: json } = await axios.get('https://www.tikwm.com/api/', {
      params: { url: videoUrl },
      timeout: 30000,
    });
    if (json.data && (json.data.play || (Array.isArray(json.data.images) && json.data.images.length))) {
      return json.data;
    }
    throw new Error('TikWM returned no media');
  } catch (error) {
    // Log only the status/code: HTTP error objects can contain credentials.
    console.warn('[TikTok] TikWM unavailable; trying fxTikTok', {
      status: error.response?.status,
      code: error.code,
    });
  }

  const url = new URL(videoUrl);
  if (!(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com')) ||
      !/^\/@[^/]+\/(video|photo)\/\d+\/?$/.test(url.pathname)) {
    throw new Error('A full TikTok post URL is required for the fallback');
  }
  // Use the post path only, without TikTok's tracking parameters.
  const embedUrl = new URL(url.pathname, 'https://tnktok.com').href;
  const { data: html } = await axios.get(embedUrl, {
    timeout: 20000,
    maxContentLength: 2 * 1024 * 1024,
    headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' },
  });
  const $ = cheerio.load(html);
  const mediaLink = $('meta[property="og:video"]').attr('content');
  if (!mediaLink) throw new Error('fxTikTok returned no video');
  const mediaUrl = new URL(mediaLink);
  if (mediaUrl.protocol !== 'https:' || mediaUrl.hostname !== 'offload.tnktok.com' ||
      mediaUrl.username || mediaUrl.password || mediaUrl.port) {
    throw new Error('Unexpected fxTikTok video host');
  }

  const video = await downloadFallbackVideo(mediaUrl);
  return { play: video };
}

module.exports = { getTikTokMedia };
