const delay = require('./delay');

function isTransient(error) {
  const status = error.response?.status;
  return status === 429 || (status >= 500 && status <= 599) ||
    ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(error.code);
}

// Retry metadata requests only; never repeat Telegram sends or large downloads.
async function retryRequest(request, { wait = delay } = {}) {
  try {
    return await request();
  } catch (error) {
    if (!isTransient(error)) throw error;
    const retryAfter = error.response?.headers?.['retry-after'];
    const seconds = Number(retryAfter);
    const requestedDelay = retryAfter == null ? 1000 : Number.isFinite(seconds)
      ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    // Do not retry earlier than Retry-After when the server requests a long wait.
    if (requestedDelay > 5000) throw error;
    await wait(Number.isFinite(requestedDelay) ? Math.max(1000, requestedDelay) : 1000);
    return request();
  }
}

module.exports = { retryRequest, isTransient };
