'use strict';

const express = require('express');
const config = require('../config');
const { seedTestData, SEED_COLLECTION } = require('../seed');
const { AppError, ErrorCodes } = require('../errors');

const router = express.Router();

// ─── POST /api/seed-test-data — dev only ────────────────────
// Inserts the synthetic eval dataset for the current user so hybrid search
// ranking can be verified. Refused in production.

router.post('/', async (req, res, next) => {
  try {
    if (config.isProduction) {
      throw new AppError('Seeding is disabled in production', ErrorCodes.FORBIDDEN, 403);
    }
    const result = await seedTestData(req.userId);
    res.status(201).json({ ...result, collectionId: SEED_COLLECTION });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
