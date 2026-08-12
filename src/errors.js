'use strict';

const ErrorCodes = Object.freeze({
  SOURCE_FETCH_FAILED: 'SOURCE_FETCH_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  LLM_API_ERROR: 'LLM_API_ERROR',
  DB_ERROR: 'DB_ERROR',
  CONFIG_INVALID: 'CONFIG_INVALID',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  INVALID_STRATEGY: 'INVALID_STRATEGY',
  CHUNKING_ERROR: 'CHUNKING_ERROR',
  PROFILE_ERROR: 'PROFILE_ERROR',
  SEARCH_ERROR: 'SEARCH_ERROR',
});

class AppError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = { AppError, ErrorCodes };
