'use strict';

const config = require('./config');
const { AppError, ErrorCodes } = require('./errors');

async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = config.sourceTimeoutMs, ...requestOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await globalThis.fetch(url, { ...requestOptions, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AppError(
        `Request to ${url} timed out after ${timeoutMs}ms`,
        ErrorCodes.SOURCE_FETCH_FAILED,
        504,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchWithTimeout };
