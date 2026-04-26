'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { createShutdownHandler } = require('./shutdown');

// Routes
const itemsRouter = require('./routes/items');
const syncRouter = require('./routes/sync');
const { router: exportRouter } = require('./routes/export');
const uploadRouter = require('./routes/upload');

const app = express();

// ─── Middleware ───────────────────────────────────────────────

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

// Serve static files from /public
app.use(express.static('public'));

// ─── Health Check ────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  let dbStatus = 'disconnected';
  try {
    db.getDb();
    dbStatus = 'connected';
  } catch (_e) {
    // DB not initialized
  }

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ──────────────────────────────────────────────────

app.use('/api/items', itemsRouter);
app.use('/api', syncRouter);
app.use('/api/export', exportRouter);
app.use('/api/upload', uploadRouter);

// ─── 404 for unknown routes ──────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ─── Global error handler ────────────────────────────────────

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

// ─── Start ───────────────────────────────────────────────────

function start() {
  // Initialize database
  db.init();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
  });

  createShutdownHandler(server, db);

  // Start scheduler (cron) + run first cycle immediately
  // scheduler.start();
  // scheduler.runCycle().catch((err) => logger.error({ err }, 'Initial cycle failed'));
  logger.info('Server ready. Use "Fetch Posts" button to sync manually.');
  
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
