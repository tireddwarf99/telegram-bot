const { test } = require('node:test');
const assert = require('node:assert/strict');
const { retryRequest } = require('../utils/retryRequest');

function failure(status, retryAfter) {
  const error = new Error(`HTTP ${status}`);
  error.response = { status, headers: { 'retry-after': retryAfter } };
  return error;
}

test('retries temporary failures once and respects short Retry-After', async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    let attempts = 0;
    const waits = [];
    const value = await retryRequest(async () => {
      if (++attempts === 1) throw failure(status, '2');
      return 'media';
    }, { wait: async ms => waits.push(ms) });
    assert.equal(value, 'media');
    assert.equal(attempts, 2);
    assert.deepEqual(waits, [2000]);
  }
});

test('preserves the final error after two failures', async () => {
  let attempts = 0;
  const error = failure(500);
  await assert.rejects(retryRequest(async () => {
    attempts++;
    throw error;
  }, { wait: async () => {} }), err => err === error);
  assert.equal(attempts, 2);
});

test('does not retry permanent failures or a long Retry-After', async () => {
  for (const error of [failure(403), failure(404), failure(429, '60'), new Error('Invalid media')]) {
    let attempts = 0;
    await assert.rejects(retryRequest(async () => {
      attempts++;
      throw error;
    }, { wait: async () => assert.fail('unexpected wait') }), err => err === error);
    assert.equal(attempts, 1);
  }
});

test('retries network timeouts with a default pause', async () => {
  let attempts = 0;
  await retryRequest(async () => {
    if (++attempts === 1) throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
  }, { wait: async ms => assert.equal(ms, 1000) });
  assert.equal(attempts, 2);
});
