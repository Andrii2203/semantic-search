'use strict';

const logger = require('./logger');

function emit(event, data = {}) {
  logger.info({ event, ...data }, `event: ${event}`);
}

module.exports = { emit };
