'use strict';

const logger = require('./logger');

/**
 * Graceful shutdown handler.
 * Closes HTTP server, DB connection, and any other resources.
 */
/* istanbul ignore next */
function createShutdownHandler(server, db) {
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received, closing gracefully...');

    // 1. Stop accepting new connections
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing HTTP server');
      } else {
        logger.info('HTTP server closed');
      }
    });

    // 2. Close database
    try {
      db.close();
    } catch (err) {
      logger.error({ err }, 'Error closing database');
    }

    // 3. Give ongoing requests time to finish (5s grace period)
    setTimeout(() => {
      logger.info('Grace period expired, forcing exit');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return shutdown;
}

module.exports = { createShutdownHandler };
