'use strict';

const express = require('express');
const logger = require('../logger');
const scheduler = require('../scheduler');
const sources = require('../sources/index');

const router = express.Router();

// ─── GET /api/sources — list registered source names ────────

router.get('/sources', (_req, res) => {
  res.json({ sources: sources.getRegisteredSources() });
});

// ─── POST /api/sync — trigger manual fetch cycle ────────────

router.post('/sync', async (_req, res, next) => {
  try {
    scheduler.runCycle().catch((err) => logger.error({ err }, 'Manual sync failed'));
    res.json({ success: true, message: 'Sync started' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
