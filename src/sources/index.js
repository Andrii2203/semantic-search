'use strict';

const logger = require('../logger');

const sources = new Map();

function register(sourceModule) {
  if (!sourceModule.name || typeof sourceModule.fetch !== 'function') {
    throw new Error(`Invalid source module: must have 'name' (string) and 'fetch' (function)`);
  }
  sources.set(sourceModule.name, sourceModule);
  logger.info({ source: sourceModule.name }, 'Source registered');
}

async function fetchAll(options = {}) {
  const results = [];
  const errors = [];

  const fetches = [...sources.entries()].map(async ([name, source]) => {
    try {
      const items = await source.fetch(options);
      return { name, items, error: null };
    } catch (err) {
      logger.error({ err, source: name }, `Source fetch failed: ${name}`);
      return { name, items: [], error: err };
    }
  });

  const outcomes = await Promise.allSettled(fetches);

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      const { name, items, error } = outcome.value;
      if (error) {
        errors.push({ source: name, error: error.message });
      }
      results.push(...items);
    }
  }

  logger.info(
    {
      totalSources: sources.size,
      successSources: sources.size - errors.length,
      failedSources: errors.length,
      totalItems: results.length,
    },
    'fetchAll complete',
  );

  if (errors.length > 0) {
    logger.warn({ errors }, 'Some sources failed during fetchAll');
  }

  return results;
}

function clearSources() {
  sources.clear();
}

register(require('./hn'));
register(require('./reddit'));
register(require('./djinni'));

module.exports = {
  register,
  fetchAll,
  clearSources,
};
