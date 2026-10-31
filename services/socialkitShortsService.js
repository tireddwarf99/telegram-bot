const axios = require('axios');

const API = 'https://api.socialkit.dev';
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 100;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function getDownloadRequest(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Invalid YouTube ID');
  return {
    url: 'https://www.youtube.com/shorts/' + id,
    format: 'mp4',
    quality: '1080p',
    max_duration: 180
  };
}

function getDownloadUrl(response) {
  if (response?.success !== true || response?.data?.status !== 'ready') {
    const error = new Error('SocialKit download is not ready');
    error.stage = 'socialkit_output';
    throw error;
  }
  const url = response.data.downloadUrl;
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    const error = new Error('SocialKit did not provide an HTTPS download URL');
    error.stage = 'socialkit_output';
    throw error;
  }
  const sizeMb = parseFloat(response.data.fileSizeMB);
  if (Number.isFinite(sizeMb) && sizeMb * 1024 * 1024 > MAX_UPLOAD_BYTES) {
    const error = new Error('Downloaded video exceeds Telegram upload limit');
    error.code = 'VIDEO_TOO_LARGE';
    error.stage = 'socialkit_output';
    throw error;
  }
  return url;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadShorts(id, { http = axios, sleep = wait, maxPolls = MAX_POLLS } = {}) {
  const accessKey = process.env.SOCIALKIT_ACCESS_KEY;
  if (!accessKey) {
    const error = new Error('SOCIALKIT_ACCESS_KEY is not set');
    error.stage = 'socialkit_config';
    throw error;
  }
  const headers = { 'x-access-key': accessKey };
  let job;
  try {
    const response = await http.post(API + '/v2/youtube/download', getDownloadRequest(id), {
      headers, timeout: 30000
    });
    job = response.data?.data;
    if (response.data?.success !== true || typeof job?.jobId !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(job.jobId)) {
      const error = new Error('SocialKit did not return a valid jobId');
      error.stage = 'socialkit_start';
      throw error;
    }
  } catch (error) {
    error.stage ||= 'socialkit_start';
    throw error;
  }

  console.info('[SocialKit] Download job created');
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    let result;
    try {
      result = await http.get(API + '/v2/downloads/' + job.jobId, {
        headers, timeout: 30000
      });
    } catch (error) {
      error.stage = 'socialkit_poll';
      throw error;
    }

    const data = result.data?.data;
    if (result.data?.success !== true || !data || typeof data.status !== 'string') {
      const error = new Error('Invalid SocialKit job status response');
      error.stage = 'socialkit_poll';
      throw error;
    }
    if (data.status === 'ready') {
      console.info('[SocialKit] Download ready', { attempts: attempt + 1 });
      return getDownloadUrl(result.data);
    }
    if (data.status === 'failed') {
      const error = new Error('SocialKit download job failed: ' +
        String(data.error || 'unknown reason').slice(0, 200));
      error.stage = 'socialkit_job';
      throw error;
    }
    if (data.status !== 'queued' && data.status !== 'processing') {
      const error = new Error('Unexpected SocialKit status: ' + data.status);
      error.stage = 'socialkit_poll';
      throw error;
    }
  }
  const error = new Error('SocialKit download job timed out');
  error.stage = 'socialkit_timeout';
  throw error;
}

module.exports = { downloadShorts, getDownloadRequest, getDownloadUrl };
