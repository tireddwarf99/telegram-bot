const axios = require('axios');
const cheerio = require('cheerio');
const { MAX_VIDEO_BYTES } = require('../utils/sendVideo');

function isMediaUrl(url) {
  const domains = ['tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokcdn.com', 'tiktokv.com'];
  const fxTikTokHost = url.hostname === 'tnktok.com' || url.hostname.endsWith('.tnktok.com');
  const tiktokCdnHost = domains.some((domain) =>
    url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (fxTikTokHost || tiktokCdnHost);
}

function markStage(error, stage) {
  if (error && typeof error === 'object' && !error.stage) error.stage = stage;
  return error;
}

async function downloadFallbackVideo(initialUrl) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (!isMediaUrl(url)) throw markStage(new Error('Unexpected fxTikTok video host'), 'fx_download');
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
      throw markStage(error, 'fx_download');
    }
    if (response.status >= 300) {
      if (!response.headers.location) throw markStage(new Error('Missing video redirect'), 'fx_download');
      url = new URL(response.headers.location, url);
      continue;
    }
    const video = Buffer.from(response.data);
    if (video.length < 12 || video.toString('ascii', 4, 8) !== 'ftyp') {
      throw markStage(new Error('fxTikTok did not return an MP4 file'), 'fx_download');
    }
    return video;
  }
  throw markStage(new Error('Too many video redirects'), 'fx_download');
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

  return getFxTikTokMedia(videoUrl);
}

async function getFxTikTokMedia(videoUrl) {
  const url = new URL(videoUrl);
  if (!(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com')) ||
      !/^\/@[^/]+\/(video|photo)\/\d+\/?$/.test(url.pathname)) {
    throw markStage(new Error('A full TikTok post URL is required for the fallback'), 'fx_validate_url');
  }
  // Use the post path only, without TikTok's tracking parameters.
  const embedUrl = new URL(url.pathname, 'https://tnktok.com').href;
  let html;
  try {
    ({ data: html } = await axios.get(embedUrl, {
      timeout: 20000,
      maxContentLength: 2 * 1024 * 1024,
      headers: {
        'User-Agent': 'TelegramBot (like TwitterBot)',
        Accept: 'text/html,application/xhtml+xml',
      },
    }));
  } catch (error) {
    throw markStage(error, 'fx_page');
  }
  const $ = cheerio.load(html);
  const mediaLink = $('meta[property="og:video"]').attr('content');
  if (!mediaLink) throw markStage(new Error('fxTikTok returned no video'), 'fx_parse_page');
  let mediaUrl;
  try {
    mediaUrl = new URL(mediaLink);
  } catch (error) {
    throw markStage(error, 'fx_parse_page');
  }
  if (!isMediaUrl(mediaUrl)) {
    const host = mediaUrl.hostname.replace(/[^a-z0-9.-]/gi, '').slice(0, 120);
    throw markStage(new Error(`Unexpected fxTikTok video host: ${host}`), 'fx_parse_page');
  }

  const video = await downloadFallbackVideo(mediaUrl);
  return { play: video };
}

module.exports = { getTikTokMedia, getFxTikTokMedia };
