const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractYoutubeId } = require('../controllers/youtubeController');
const { getActorInput, findVideoUrl } = require('../services/apifyShortsService');
test('Shorts ID', () => {
  assert.equal(extractYoutubeId('https://youtube.com/shorts/Q2fJy9t0fpE'), 'Q2fJy9t0fpE');
});
test('Apify input', () => {
  assert.deepEqual(getActorInput('Q2fJy9t0fpE'), {
    urls: ['https://www.youtube.com/shorts/Q2fJy9t0fpE'],
    audioOnly: false, ffmpeg: true,
    proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'AL' }
  });
});
test('video link', () => {
  assert.equal(findVideoUrl([{downloadUrl:'https://storage.example/video.mp4'}]), 'https://storage.example/video.mp4');
});
