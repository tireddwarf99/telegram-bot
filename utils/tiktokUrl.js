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

function getTikTokPostPath(url) {
  if (!isTikTokHost(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const authorIndex = parts.findIndex((part) => part.startsWith('@') && part.length > 1);
  if (authorIndex < 0) return null;
  const author = parts[authorIndex];
  const type = parts[authorIndex + 1];
  const id = parts[authorIndex + 2];
  if (!['video', 'photo'].includes(type) || !id || !/^\d+$/.test(id)) return null;
  return `/${author}/${type}/${id}`;
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

  // Canonical post URLs need no network lookup.
  if (getTikTokPostPath(url)) return url.href;

  // Expand short and mobile TikTok URLs so downstream downloaders receive a post URL.
  for (let redirects = 0; redirects < 5; redirects += 1) {
    if (!isShortHost(url.hostname) && !isTikTokHost(url.hostname)) return url.href;
    const response = await axios.get(url.href, {
      maxRedirects: 0,
      timeout: 10000,
      maxContentLength: 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const location = response.headers.location;
    if (!location) return url.href;
    url = parseSupportedUrl(new URL(location, url).href);
    if (!url) throw new Error('TikTok short link redirected to an unsupported host');
    if (getTikTokPostPath(url)) return url.href;
  }
  throw new Error('Too many TikTok short-link redirects');
}

module.exports = { extractTikTokUrl, resolveTikTokUrl };
