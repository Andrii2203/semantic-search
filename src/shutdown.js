'use strict';

const logger = require('./logger');

const DEFAULT_POLL_INTERVAL_MS = 200;
const DEFAULT_MAX_WAIT_MS = 30000;

function closeServer(server) {
  return new Promise((resolve) => {
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing HTTP server');
      } else {
        logger.info('HTTP server closed');
      }
      resolve();
    });
  });
}

async function waitForIdle(scheduler, pollIntervalMs, maxWaitMs) {
  if (!scheduler || typeof scheduler.isRunning !== 'function') {
    return;
  }

  const deadline = Date.now() + maxWaitMs;
  while (scheduler.isRunning()) {
    if (Date.now() >= deadline) {
      logger.warn({ maxWaitMs }, 'Ingest cycle still running at the deadline, closing anyway');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

function createShutdownHandler(server, db, options = {}) {
  const {
    scheduler = null,
    exit = /* istanbul ignore next */ (code) => process.exit(code),
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
  } = options;

  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received, closing gracefully');

    await closeServer(server);
    await waitForIdle(scheduler, pollIntervalMs, maxWaitMs);

    try {
      db.close();
      logger.info('Database closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database');
    }

    exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return shutdown;
}

module.exports = { createShutdownHandler };
