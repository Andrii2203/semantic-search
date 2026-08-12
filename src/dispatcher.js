'use strict';

const logger = require('./logger');
const actionsRegistry = require('./actions/index');

class RateLimiter {
  constructor(maxPerMinute) {
    this.maxPerMinute = maxPerMinute;
    this.timestamps = [];
  }

  async waitForSlot() {
    const now = Date.now();

    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);

    /* istanbul ignore next */
    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0];
      const waitMs = 60_000 - (now - oldest) + 100;
      logger.info({ waitMs }, 'Rate limiter: waiting for slot');
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.waitForSlot();
    }

    this.timestamps.push(Date.now());
  }
}

async function dispatch(item, context = {}, opts = {}) {
  const action = actionsRegistry.getAction(item.type);

  if (!action) {
    logger.warn({ itemId: item.id, type: item.type }, 'No action registered for type');
    return { response: null, status: 'skipped' };
  }

  try {
    if (opts.rateLimiter) {
      await opts.rateLimiter.waitForSlot();
    }

    const response = await action.run(item, context);

    if (response) {
      return { response, status: 'new' };
    }
    return { response: null, status: 'pending' };
  } catch (err) {
    logger.error({ err, itemId: item.id, action: action.name }, 'Action dispatch failed');
    return { response: null, status: 'pending' };
  }
}

/* istanbul ignore next */
async function dispatchBatch(items, context = {}, rateLimit = 10) {
  const rateLimiter = new RateLimiter(rateLimit);
  const results = [];

  for (const item of items) {
    const { response, status } = await dispatch(item, context, { rateLimiter });
    results.push({ ...item, response, status });
  }

  logger.info(
    {
      total: items.length,
      dispatched: results.filter((r) => r.response).length,
      pending: results.filter((r) => r.status === 'pending').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    },
    'Batch dispatch complete',
  );

  return results;
}

module.exports = {
  dispatch,
  dispatchBatch,
  RateLimiter,
};
