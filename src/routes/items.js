'use strict';

const express = require('express');
const db = require('../db');
const { AppError, ErrorCodes } = require('../errors');
const { validateItemQuery } = require('../validation');

const router = express.Router();

// ─── GET /api/items — list items with optional filters ──────

router.get('/', (req, res, next) => {
  try {
    const parsed = validateItemQuery(req.query);
    if (!parsed.success) {
      throw new AppError(
        `Invalid query: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        ErrorCodes.VALIDATION_FAILED,
        400,
      );
    }

    const items = db.getItems(parsed.data);
    const total = db.getItemCount(parsed.data.status, parsed.data.source);

    res.json({
      items,
      total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/items/stats — counts by status ────────────────

router.get('/stats', (_req, res, next) => {
  try {
    res.json({
      total: db.getItemCount(),
      new: db.getItemCount('new'),
      approved: db.getItemCount('approved'),
      skipped: db.getItemCount('skipped'),
      pending: db.getItemCount('pending'),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/items/:id/approve — approve an item ─────────

router.post('/:id/approve', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    db.updateItemStatus(id, 'approved');
    res.json({ success: true, id, status: 'approved' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/items/:id/skip — skip an item ───────────────

router.post('/:id/skip', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    db.updateItemStatus(id, 'skipped');
    res.json({ success: true, id, status: 'skipped' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/items/:id/generate — on-demand AI comment ───

router.post('/:id/generate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    const generateComment = require('../actions/generate-comment');
    const comment = await generateComment.run(item);

    if (!comment) {
      throw new AppError('AI returned empty response', 'GENERATION_FAILED', 500);
    }

    // Save to DB
    db.updateItemResponse(id, comment, null);

    // Save to JSON export file
    const { saveToExportFile } = require('./export');
    await saveToExportFile(id, item, comment);

    const logger = require('../logger');
    logger.info({ itemId: id, responseLength: comment.length }, 'Comment generated on demand');
    res.json({ success: true, id, comment });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
