const axios = require('axios');

const isTikTokHost = (hostname) => hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com');
const isShortHost = (hostname) => hostname === 'tt.site' || hostname === 'www.tt.site';

function parseSupportedUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    return isTikTokHost(url.hostname) || isShortHost(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

function extractTikTokUrl(text) {
  const links = (text || '').match(/https?:\/\/[^\s<>"\[\]]+/gi) || [];
  for (const link of links) {
    const url = parseSupportedUrl(link.replace(/[),.!?;]+$/, ''));
    if (url) return url.href;
  }
  return null;
}

async function resolveTikTokUrl(value) {
  let url = parseSupportedUrl(value);
  if (!url) throw new Error('Unsupported TikTok URL');

  // Stop as soon as TikTok is reached: its page may require cookies or reject bots.
  for (let redirects = 0; redirects < 5; redirects += 1) {
    if (isTikTokHost(url.hostname)) return url.href;
    const response = await axios.get(url.href, {
      maxRedirects: 0,
      timeout: 10000,
      maxContentLength: 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: (status) => status >= 300 && status < 400,
    });
    const location = response.headers.location;
    if (!location) throw new Error('tt.site did not return a redirect');
    url = parseSupportedUrl(new URL(location, url).href);
    if (!url) throw new Error('tt.site redirected to an unsupported host');
  }
  if (isTikTokHost(url.hostname)) return url.href;
  throw new Error('Too many tt.site redirects');
}

module.exports = { extractTikTokUrl, resolveTikTokUrl };
