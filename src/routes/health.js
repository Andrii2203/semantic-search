'use strict';

const express = require('express');
const router = express.Router();
const startup = require('../startup');
const scheduler = require('../scheduler');

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

module.exports = router;
