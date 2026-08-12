'use strict';

const express = require('express');
const logger = require('../logger');
const scheduler = require('../scheduler');
const db = require('../db');

const router = express.Router();

router.get('/sources', (_req, res) => {
  /* istanbul ignore next */
  try {
    const list = db.getSources();
    res.json({ sources: list });
  } catch (err) {
    logger.error({ err }, 'Failed to get sources');
    res.status(500).json({ error: 'Failed to get sources' });
  }
});

router.get('/sync/status', (_req, res) => {
  res.json(scheduler.getStatus());
});

router.post('/sync', async (_req, res, next) => {
  try {
    scheduler.runCycle().catch((err) => logger.error({ err }, 'Manual sync failed'));
    res.json({ success: true, message: 'Sync started' });
  } catch (err) {
    /* istanbul ignore next */
    next(err);
  }
});

module.exports = router;
