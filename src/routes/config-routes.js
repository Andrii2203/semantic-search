'use strict';

const express = require('express');
const db = require('../db');
const { chunk } = require('../chunker');
const SearchEngine = require('../search-engine');
const logger = require('../logger');
const { AppError, ErrorCodes } = require('../errors');

const router = express.Router();

// ─── Chunking Config ────────────────────────────────────────

// GET /api/config/chunking
router.get('/chunking', (_req, res, next) => {
  try {
    const config = db.getChunkingConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// POST /api/config/chunking
router.post('/chunking', (req, res, next) => {
  try {
    const { strategy, chunkSize, overlap } = req.body;

    // Validate strategy
    const validStrategies = ['fixed', 'semantic', 'hierarchical'];
    if (strategy && !validStrategies.includes(strategy)) {
      throw new AppError(
        `Invalid strategy: ${strategy}. Valid: ${validStrategies.join(', ')}`,
        ErrorCodes.INVALID_STRATEGY,
        400,
      );
    }

    // Validate numbers
    if (chunkSize !== undefined && (chunkSize < 50 || chunkSize > 1000)) {
      throw new AppError('chunkSize must be between 50 and 1000', ErrorCodes.VALIDATION_FAILED, 400);
    }
    if (overlap !== undefined && (overlap < 0 || overlap > 200)) {
      throw new AppError('overlap must be between 0 and 200', ErrorCodes.VALIDATION_FAILED, 400);
    }

    db.updateChunkingConfig({ strategy, chunkSize, overlap });

    const updated = db.getChunkingConfig();
    logger.info({ config: updated }, 'Chunking config updated');

    res.json({ success: true, config: updated });
  } catch (err) {
    next(err);
  }
});

// ─── Profiles ───────────────────────────────────────────────

// GET /api/config/profiles
router.get('/profiles', (_req, res, next) => {
  try {
    const profiles = db.getAllProfiles();
    res.json({ profiles });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/config/profiles/:id
router.delete('/profiles/:id', (req, res, next) => {
  try {
    const deleted = db.deleteProfile(req.params.id);
    if (!deleted) {
      throw new AppError(`Profile not found: ${req.params.id}`, ErrorCodes.NOT_FOUND, 404);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Re-chunk ───────────────────────────────────────────────

// POST /api/config/rechunk — re-chunk all items with current strategy
router.post('/rechunk', async (req, res, next) => {
  try {
    const config = db.getChunkingConfig();
    const strategy = req.body.strategy || config.strategy;
    const options = {
      chunkSize: req.body.chunkSize || config.chunk_size,
      overlap: req.body.overlap || config.overlap,
    };

    // Get all items
    const items = db.getItems({ limit: 10000 });
    let processed = 0;
    let errors = 0;

    for (const item of items) {
      try {
        // Delete old chunks
        db.deleteChunksByParent(item.id);

        // Re-chunk
        const chunks = await chunk(item.content, strategy, options);

        // Generate embeddings and save
        for (const c of chunks) {
          let vector = null;
          try {
            const embedding = await SearchEngine.generateEmbedding(c.content);
            vector = SearchEngine.serializeVector(embedding);
          } catch {
            // Skip embedding on failure
          }

          db.insertChunk({
            id: `${item.id}_chunk_${c.chunkIndex}`,
            parentId: item.id,
            content: c.content,
            chunkIndex: c.chunkIndex,
            level: c.level || 'section',
            strategy: c.strategy,
            vector,
            metadata: c.metadata || {},
          });
        }

        processed++;
      } catch (err) {
        logger.error({ err, itemId: item.id }, 'Re-chunk failed for item');
        errors++;
      }
    }

    logger.info({ processed, errors, strategy }, 'Re-chunking complete');
    res.json({ success: true, processed, errors, strategy });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
