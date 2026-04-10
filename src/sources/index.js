'use strict';

const logger = require('../logger');

// ─── Source Registry ─────────────────────────────────────────

const sources = new Map();

/**
 * Register a source module.
 * Each source module must export: { name: string, fetch: () => Promise<IR[]> }
 */
function register(sourceModule) {
  if (!sourceModule.name || typeof sourceModule.fetch !== 'function') {
    throw new Error(`Invalid source module: must have 'name' (string) and 'fetch' (function)`);
  }
  sources.set(sourceModule.name, sourceModule);
  logger.info({ source: sourceModule.name }, 'Source registered');
}

/**
 * Fetch from all registered sources with failure isolation.
 * If one source fails, the others still return their data.
 *
 * @param {Object} options — passed to each source's fetch()
 * @returns {Promise<IR[]>} — merged array of IR items from all sources
 */
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

/**
 * Get list of registered source names.
 */
function getRegisteredSources() {
  return [...sources.keys()];
}

/**
 * Clear all registered sources (for testing).
 */
function clearSources() {
  sources.clear();
}

// ─── Auto-register built-in sources ──────────────────────────

register(require('./hn'));
register(require('./reddit'));
register(require('./djinni'));

// ─── Exports ─────────────────────────────────────────────────

module.exports = {
  register,
  fetchAll,
  getRegisteredSources,
  clearSources,
};
