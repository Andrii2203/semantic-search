'use strict';

const express = require('express');
const db = require('../db');
const { AppError, ErrorCodes } = require('../errors');
const { validateItemQuery } = require('../validation');
const events = require('../events');

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
    // Inbox badges count only the internet collection — same as the inbox list.
    // Files / __test__ items have their own views and must not inflate the badges.
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

// ─── Status actions (approve / skip / star) ─────────────────
// Personal status lives in user_matches for shared internet content (v7.1);
// star/approve/skip also feed the learning loop (profile vector blend)

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

      // Feedback loop is best-effort: a failed blend must not fail the action
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

// ─── POST /api/items/:id/generate — on-demand AI comment ───

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

// ─── DELETE /api/items/:id ──────────────────────────────────
// Shared internet content: removes the user's match only (corpus row stays —
// other users may still need it). Private items: physical delete with chunks.

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
