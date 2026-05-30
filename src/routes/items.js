'use strict';

const express = require('express');
const db = require('../db');
const { AppError, ErrorCodes } = require('../errors');
const { validateItemQuery } = require('../validation');

const router = express.Router();

// ─── GET /api/items — list with cursor pagination ────────────

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

    const { cursor, limit, offset, ...filters } = parsed.data;
    const userId = req.userId;
    const page = db.getItemsPage({ ...filters, limit, cursor, userId });
    const total = db.getItemCount({ ...filters, userId });

    res.json({
      items: page.items,
      total,
      limit,
      offset: cursor ? undefined : offset,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/items/stats — counts by status ────────────────

router.get('/stats', (req, res, next) => {
  try {
    const userId = req.userId;
    res.json({
      total:    db.getItemCount({ userId }),
      new:      db.getItemCount({ status: 'new',      userId }),
      approved: db.getItemCount({ status: 'approved', userId }),
      skipped:  db.getItemCount({ status: 'skipped',  userId }),
      pending:  db.getItemCount({ status: 'pending',  userId }),
      starred:  db.getItemCount({ status: 'starred',  userId }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/items/:id/approve ────────────────────────────

router.post('/:id/approve', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item || (item.user_id && item.user_id !== req.userId)) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    db.updateItemStatus(id, 'approved');
    res.json({ success: true, id, status: 'approved' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/items/:id/skip ───────────────────────────────

router.post('/:id/skip', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item || (item.user_id && item.user_id !== req.userId)) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    db.updateItemStatus(id, 'skipped');
    res.json({ success: true, id, status: 'skipped' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/items/:id/star ───────────────────────────────

router.post('/:id/star', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item || (item.user_id && item.user_id !== req.userId)) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    db.updateItemStatus(id, 'starred');
    res.json({ success: true, id, status: 'starred' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/items/:id/generate — on-demand AI comment ───

router.post('/:id/generate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item || (item.user_id && item.user_id !== req.userId)) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    if (item.response) {
      return res.json({ success: true, id, comment: item.response, cached: true });
    }

    const generateComment = require('../actions/generate-comment');
    const comment = await generateComment.run(item);

    if (!comment) {
      throw new AppError('AI returned empty response', 'GENERATION_FAILED', 500);
    }

    db.updateItemResponse(id, comment, null);

    const { saveToExportFile } = require('./export');
    await saveToExportFile(id, item, comment);

    const logger = require('../logger');
    logger.info({ itemId: id, responseLength: comment.length }, 'Comment generated on demand');
    res.json({ success: true, id, comment, cached: false });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/items/:id — remove item + its chunks ──────

router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item || (item.user_id && item.user_id !== req.userId)) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    db.deleteChunksByParent(id);
    db.deleteItem(id);
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
