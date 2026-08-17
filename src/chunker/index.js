'use strict';

const { countTokens } = require('./utils');
const chunkFixed = require('./fixed');
const chunkSemantic = require('./semantic');
const chunkHierarchical = require('./hierarchical');
const { AppError, ErrorCodes } = require('../errors');
const constants = require('../search-constants');

const strategies = {
  fixed: chunkFixed,
  semantic: chunkSemantic,
  hierarchical: chunkHierarchical,
};

async function chunk(text, strategy = 'semantic', options = {}) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  if (countTokens(text) <= constants.chunkingSkippedBelowTokens) {
    return [
      {
        content: text.trim(),
        chunkIndex: 0,
        strategy: 'none',
        level: 'document',
        metadata: {},
      },
    ];
  }

  const chunker = strategies[strategy];
  if (!chunker) {
    throw new AppError(
      `Unknown chunking strategy: ${strategy}. Valid: ${Object.keys(strategies).join(', ')}`,
      ErrorCodes.INVALID_STRATEGY,
      400,
    );
  }

  return chunker(text, options);
}

module.exports = { chunk, strategies };
