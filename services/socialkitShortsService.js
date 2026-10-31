const axios = require('axios');
const ENDPOINT = 'https://api.socialkit.dev/youtube/download';
const MAX_FILE_SIZE = 10 * 1000 * 1000;

function getDownloadRequest(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Invalid YouTube ID');
  return {
    url: 'https://www.youtube.com/shorts/' + id,
    format: 'mp4',
    quality: '1080p'
  };
}

function getDownloadUrl(response) {
  if (response?.success !== true || typeof response?.data?.downloadUrl !== 'string') {
    const error = new Error('SocialKit did not return a video download URL');
    error.stage = 'socialkit_output';
    throw error;
  }
  if (Number(response.data.fileSize) > MAX_FILE_SIZE) {
    const error = new Error('SocialKit video exceeds the 10MB API limit');
    error.stage = 'socialkit_output';
    error.code = 'SOCIALKIT_FILE_TOO_LARGE';
    throw error;
  }
  const url = response.data.downloadUrl;
  if (!/^https:\/\//i.test(url)) {
    const error = new Error('SocialKit download URL must be HTTPS');
    error.stage = 'socialkit_output';
    throw error;
  }
  return url;
}

async function downloadShorts(id) {
  const accessKey = process.env.SOCIALKIT_ACCESS_KEY;
  if (!accessKey) {
    const error = new Error('SOCIALKIT_ACCESS_KEY is not set');
    error.stage = 'socialkit_config';
    throw error;
  }
  let response;
  try {
    response = await axios.post(ENDPOINT, getDownloadRequest(id), {
      headers: { 'x-access-key': accessKey, 'Content-Type': 'application/json' },
      timeout: 120000
    });
  } catch (error) {
    error.stage = 'socialkit_request';
    console.error('[SocialKit] API request failed', {
      status: error.response?.status,
      code: error.code
    });
    throw error;
  }
  return getDownloadUrl(response.data);
}

module.exports = { downloadShorts, getDownloadRequest, getDownloadUrl };
