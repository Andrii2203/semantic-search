'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { createShutdownHandler } = require('./shutdown');

const itemsRouter = require('./routes/items');
const syncRouter = require('./routes/sync');
const { router: exportRouter } = require('./routes/export');
const uploadRouter = require('./routes/upload');
const searchRouter = require('./routes/search');
const profilesRouter = require('./routes/profiles');
const seedRouter = require('./routes/seed');
const { router: settingsRouter } = require('./routes/settings');
const configRouter = require('./routes/config-routes');
const authRouter = require('./routes/auth');
const clientErrorRouter = require('./routes/client-error');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);

app.use(helmet());

app.use(
  cors({
    origin: config.corsOrigin,
  }),
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: config.apiRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } },
  }),
);

app.use(express.json());

app.use(express.static('public'));

const healthRouter = require('./routes/health');
app.use('/api/health', healthRouter);

app.use('/api/auth', authRouter);
app.use('/api/client-error', clientErrorRouter);

app.use(requireAuth);

app.use('/api/items', itemsRouter);
app.use('/api', syncRouter);
app.use('/api/export', exportRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/search', searchRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/seed-test-data', seedRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/config', configRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (statusCode >= 500) {
    logger.error({ err, code }, err.message);
  }

  res.status(statusCode).json({
    error: {
      code,
      message: config.isProduction ? 'Internal server error' : err.message,
    },
  });
});

const startup = require('./startup');
const scheduler = require('./scheduler');

async function start() {
  db.init();
  
  try {
    await startup.runStartupChecks();
  } catch (err) {
    logger.fatal('Failed to pass startup checks, shutting down.');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
  });

  createShutdownHandler(server, db, { scheduler });

  scheduler.start();
  scheduler.runCycle().catch((err) => logger.error({ err }, 'Initial cycle failed'));

  logger.info('Server ready');

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
