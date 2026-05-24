'use strict';

const express = require('express');
const router = express.Router();
const startup = require('../startup');

router.get('/', (req, res) => {
  const status = startup.getLastStatus();
  res.json({
    ...status,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
