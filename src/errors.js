'use strict';

const ErrorCodes = Object.freeze({
  SOURCE_FETCH_FAILED: 'SOURCE_FETCH_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  LLM_API_ERROR: 'LLM_API_ERROR',
  DB_ERROR: 'DB_ERROR',
  CONFIG_INVALID: 'CONFIG_INVALID',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
});

class AppError extends Error {
  /**
   * @param {string} message  — human-readable message
   * @param {string} code     — one of ErrorCodes
   * @param {number} statusCode — HTTP status (default 500)
   */
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = { AppError, ErrorCodes };
