'use strict';

const express = require('express');
const db = require('../db');
const { AppError, ErrorCodes } = require('../errors');
const { validateItemQuery } = require('../validation');
const events = require('../events');

const router = express.Router();

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

router.get('/stats', (req, res, next) => {
  try {
    const userId = req.userId;
    const collectionId = 'internet';
    res.json({
      total:    db.getItemCount({ collectionId, userId }),
      new:      db.getItemCount({ status: 'new',      collectionId, userId }),
      approved: db.getItemCount({ status: 'approved', collectionId, userId }),
      skipped:  db.getItemCount({ status: 'skipped',  collectionId, userId }),
      pending:  db.getItemCount({ status: 'pending',  collectionId, userId }),
      starred:  db.getItemCount({ status: 'starred',  collectionId, userId }),
    });
  } catch (err) {
    next(err);
  }
});

const STATUS_ACTIONS = [
  { action: 'approve', status: 'approved', feedback: 'approve' },
  { action: 'skip', status: 'skipped', feedback: 'skip' },
  { action: 'star', status: 'starred', feedback: 'star' },
];

for (const { action, status, feedback } of STATUS_ACTIONS) {
  router.post(`/:id/${action}`, async (req, res, next) => {
    try {
      const { id } = req.params;
      const item = db.getItemById(id);

      if (!item || !db.userCanAccessItem(item, req.userId)) {
        throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
      }

      db.setItemStatusForUser(id, req.userId, status);
      events.emit(`item.${status}`, { itemId: id, userId: req.userId });

      try {
        const { applyFeedback } = require('../feedback');
        await applyFeedback(req.userId, item, feedback);
      } catch (feedbackErr) {
        const logger = require('../logger');
        logger.warn({ err: feedbackErr, itemId: id, action }, 'Feedback blend failed');
      }

      res.json({ success: true, id, status });
    } catch (err) {
      next(err);
    }
  });
}

router.post('/:id/generate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item || !db.userCanAccessItem(item, req.userId)) {
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
    events.emit('ai.generate.completed', { itemId: id, userId: req.userId });
    res.json({ success: true, id, comment, cached: false });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item || !db.userCanAccessItem(item, req.userId)) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    if (item.collection_id === 'internet' && req.userId) {
      db.deleteUserMatch(req.userId, id);
    } else {
      db.deleteChunksByParent(id);
      db.deleteItem(id);
    }

    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
