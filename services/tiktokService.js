const axios = require('axios');
const cheerio = require('cheerio');
const { MAX_VIDEO_BYTES } = require('../utils/sendVideo');

function isMediaUrl(url) {
  const domains = ['tiktokcdn-us.com', 'tiktokcdn.com', 'tiktokv.com'];
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (url.hostname === 'offload.tnktok.com' || domains.some((domain) =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`)));
}

function markStage(error, stage) {
  if (error && typeof error === 'object' && !error.stage) error.stage = stage;
  return error;
}

async function downloadFallbackVideo(initialUrl) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (!isMediaUrl(url)) throw new Error('Unexpected fxTikTok video host');
    let response;
    try {
      // Retry transient throttling/provider errors once; keep other failures immediate.
      for (let attempt = 0; ; attempt += 1) {
        try {
          response = await axios.get(url.href, {
            responseType: 'arraybuffer',
            timeout: 45000,
            maxContentLength: MAX_VIDEO_BYTES,
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
              'Accept-Encoding': 'identity',
            },
          });
          break;
        } catch (error) {
          const status = error.response?.status;
          if (attempt >= 1 || !(status === 429 || status >= 500 || !status)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
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
  const pathParts = url.pathname.split('/').filter(Boolean);
  const authorIndex = pathParts.findIndex((part) => part.startsWith('@') && part.length > 1);
  const postType = authorIndex >= 0 ? pathParts[authorIndex + 1] : null;
  const postId = authorIndex >= 0 ? pathParts[authorIndex + 2] : null;
  if (!(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com')) ||
      authorIndex < 0 || !['video', 'photo'].includes(postType) || !postId || !/^[0-9]+$/.test(postId)) {
    throw markStage(new Error(`TikTok URL is not a canonical post link (${url.hostname}${url.pathname.slice(0, 160)})`), 'fx_validate_url');
  }
  // Use only the canonical post path, without tracking or extra path segments.
  const postPath = `/${pathParts[authorIndex]}/${postType}/${postId}`;
  const embedUrl = new URL(postPath, 'https://tnktok.com').href;
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
  if (!mediaLink) {
    throw markStage(new Error('fxTikTok returned no video'), 'fx_parse_page');
  }
  const mediaUrl = new URL(mediaLink);
  if (mediaUrl.protocol !== 'https:' || mediaUrl.hostname !== 'offload.tnktok.com' ||
      mediaUrl.username || mediaUrl.password || mediaUrl.port) {
    throw markStage(new Error('Unexpected fxTikTok video host'), 'fx_parse_page');
  }

  const video = await downloadFallbackVideo(mediaUrl);
  return { play: video };
}

module.exports = { getTikTokMedia, getFxTikTokMedia };
