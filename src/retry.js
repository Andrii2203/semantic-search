'use strict';

async function retry(fn, opts = {}) {
  const { maxRetries = 3, baseDelay = 1000, onRetry, label = 'operation' } = opts;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);

      if (onRetry) {
        onRetry(err, attempt + 1, delay);
      }

      await sleep(delay);
    }
  }

  const error = new Error(
    `[RETRY] ${label} failed after ${maxRetries + 1} attempts: ${lastError.message}`,
  );
  error.code = 'RETRY_EXHAUSTED';
  error.cause = lastError;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { retry, sleep };
