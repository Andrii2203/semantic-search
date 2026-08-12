'use strict';

const express = require('express');
const ProfileGenerator = require('../profile-generator');
const db = require('../db');
const scheduler = require('../scheduler');
const logger = require('../logger');
const { AppError, ErrorCodes } = require('../errors');

const router = express.Router();

// ─── POST /api/profiles — save the user's active profile ────
// Free text → keywords + embedding vector → stored as the user's profile.
// The scheduler then matches new content against this vector.

router.post('/', async (req, res, next) => {
  try {
    const { rawInput } = req.body || {};
    if (!rawInput || typeof rawInput !== 'string') {
      throw new AppError('"rawInput" is required', ErrorCodes.VALIDATION_FAILED, 400);
    }

    // fromText validates min length and builds keywords + vector
    const generated = await ProfileGenerator.fromText(rawInput, { useAI: true, save: false });

    db.saveProfileForUser(req.userId, {
      keywords: generated.keywords,
      rawInput,
      vector: generated.vector,
    });
    scheduler.invalidateProfileCache(req.userId);

    logger.info({ userId: req.userId, keywordCount: generated.keywords.length }, 'Active profile saved');
    res.status(201).json({
      id: generated.id,
      keywords: generated.keywords,
      rawInput,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/profiles/active — the user's current profile ──

router.get('/active', (req, res, next) => {
  try {
    const profile = db.getProfileByUserId(req.userId);
    if (!profile) {
      return res.json({ profile: null });
    }
    res.json({
      profile: {
        id: profile.id,
        keywords: profile.keywords,
        rawInput: profile.raw_input || '',
        updatedAt: profile.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
