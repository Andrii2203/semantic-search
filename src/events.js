'use strict';

const logger = require('./logger');

// Business events — structured log lines for key user/system actions
// (search.completed, sync.completed, item.*, ai.generate.completed).
// Lightweight instrumentation; feeds a future analytics dashboard (Phase 5).

function emit(event, data = {}) {
  logger.info({ event, ...data }, `event: ${event}`);
}

module.exports = { emit };
