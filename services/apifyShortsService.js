const axios = require('axios');
const ACTOR = 'oIS5Zhu70qEK0t7Lx';

function getActorInput(id) {
  return {
    urls: ['https://www.youtube.com/shorts/' + id],
    audioOnly: false,
    ffmpeg: true,
    proxy: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
      apifyProxyCountry: 'AL'
    }
  };
}

function findVideoUrl(items) {
  for (const item of Array.isArray(items) ? items : []) {
    const fields = [
      item.downloadUrl, item.downloadURL, item.videoUrl, item.videoURL,
      item.fileUrl, item.mp4Url, item.outputUrl,
      item.video?.url, item.video?.downloadUrl, item.file?.url,
      item.result?.downloadUrl, item.result?.videoUrl
    ];
    for (const url of fields) {
      if (typeof url === 'string' && url.startsWith('https://') &&
          !url.includes('youtube.com/shorts/') &&
          !url.includes('youtube.com/watch?') &&
          !url.includes('youtu.be/')) return url;
    }
  }
  return null;
}

async function downloadShorts(id) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    const e = new Error('APIFY_API_TOKEN is missing on Render');
    e.stage = 'apify_config';
    throw e;
  }
  let response;
  try {
    response = await axios.post(
      'https://api.apify.com/v2/acts/' + ACTOR + '/run-sync-get-dataset-items',
      getActorInput(id),
      {
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        params: { clean: true, format: 'json' },
        timeout: 300000
      }
    );
  } catch (error) {
    error.stage = 'apify_run';
    const details = error.response?.data?.error;
    const message = typeof details?.message === 'string' ? details.message : '';
    // Do not log request config, Authorization headers, or the full Axios error.
    console.error('[Apify] Actor request rejected', {
      status: error.response?.status,
      type: typeof details?.type === 'string' ? details.type.slice(0, 100) : undefined,
      detail: message.replaceAll(token, '[REDACTED]').slice(0, 300) || undefined,
    });
    throw error;
  }
  const url = findVideoUrl(response.data);
  if (!url) {
    console.error('[YouTube] No media URL in Apify dataset', {
      count: Array.isArray(response.data) ? response.data.length : 0,
      fields: Object.keys(response.data?.[0] || {})
    });
    const e = new Error('Apify output contains no recognized video download URL');
    e.stage = 'apify_output';
    throw e;
  }
  return url;
}

module.exports = { downloadShorts, getActorInput, findVideoUrl };
