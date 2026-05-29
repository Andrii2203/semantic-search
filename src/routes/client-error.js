'use strict';

const express = require('express');
const logger = require('../logger');
const { AppError } = require('../errors');

const router = express.Router();

router.post('/', (req, res, next) => {
  try {
    const { message, stack, url, userAgent } = req.body || {};

    if (!message) {
      throw new AppError('message is required', 'VALIDATION_FAILED', 400);
    }

    logger.error(
      { clientError: { message, stack: stack || null, url: url || null, userAgent: userAgent || null } },
      'Client error reported',
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
