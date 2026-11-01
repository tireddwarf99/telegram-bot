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

function isTikTokPostUrl(url) {
  const pathname = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const parts = pathname.split('/');
  return isTikTokHost(url.hostname) && parts.length === 4 &&
    parts[1].startsWith('@') && parts[1].length > 1 &&
    ['video', 'photo'].includes(parts[2]) && /^\d+$/.test(parts[3]);
}

function isTikTokShortUrl(url) {
  return isShortHost(url.hostname) ||
    ['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) ||
    (isTikTokHost(url.hostname) && /^\/t\//.test(url.pathname));
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

  // Canonical post URLs need no network lookup. Resolve only known short-link forms.
  if (isTikTokPostUrl(url) || !isTikTokShortUrl(url)) return url.href;

  for (let redirects = 0; redirects < 5; redirects += 1) {
    const response = await axios.get(url.href, {
      maxRedirects: 0,
      timeout: 10000,
      maxContentLength: 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: (status) => status >= 300 && status < 400,
    });
    const location = response.headers.location;
    if (!location) throw new Error('TikTok short link did not return a redirect');
    url = parseSupportedUrl(new URL(location, url).href);
    if (!url) throw new Error('TikTok short link redirected to an unsupported host');
    if (isTikTokPostUrl(url)) return url.href;
    if (!isTikTokShortUrl(url)) throw new Error('TikTok short link did not resolve to a post URL');
  }
  throw new Error('Too many TikTok short-link redirects');
}

module.exports = { extractTikTokUrl, resolveTikTokUrl };
