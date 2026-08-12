'use strict';

const express = require('express');
const db = require('../db');
const logger = require('../logger');
const { AppError, ErrorCodes } = require('../errors');

const router = express.Router();

function assertUsableFeedUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new AppError('"url" is required', ErrorCodes.VALIDATION_FAILED, 400);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(`Not a valid URL: ${url}`, ErrorCodes.VALIDATION_FAILED, 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('A source URL must be http or https', ErrorCodes.VALIDATION_FAILED, 400);
  }
}

router.get('/', (req, res, next) => {
  try {
    res.json({ sources: db.getUserSources(req.userId) });
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const { url, label } = req.body || {};
    assertUsableFeedUrl(url);

    const source = db.addUserSource({ userId: req.userId, type: 'rss', url, label: label || url });
    logger.info({ userId: req.userId, url }, 'Source added');

    res.status(201).json({ source });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/toggle', (req, res, next) => {
  try {
    const enabled = req.body?.enabled !== false;
    const changed = db.setUserSourceEnabled({ id: req.params.id, userId: req.userId, enabled });
    if (!changed) {
      throw new AppError(`Source not found: ${req.params.id}`, ErrorCodes.NOT_FOUND, 404);
    }

    res.json({ success: true, id: req.params.id, enabled });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const removed = db.deleteUserSource({ id: req.params.id, userId: req.userId });
    if (!removed) {
      throw new AppError(`Source not found: ${req.params.id}`, ErrorCodes.NOT_FOUND, 404);
    }

    res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
