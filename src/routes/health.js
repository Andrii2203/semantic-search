'use strict';

const express = require('express');
const router = express.Router();
const startup = require('../startup');
const scheduler = require('../scheduler');
const healthChecker = require('../health-checker');

router.get('/', (req, res) => {
  const status = startup.getLastStatus();
  res.json({
    ...status,
    modules: {
      ...status.modules,
      scheduler: scheduler.getStatus().status
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

router.get('/full', async (_req, res, next) => {
  try {
    const health = await healthChecker.getHealth();
    res.json({ ...health, uptime: Math.floor(process.uptime()) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
