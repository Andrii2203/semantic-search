'use strict';

const express = require('express');
const db = require('../db');
const logger = require('../logger');
const { AppError, ErrorCodes } = require('../errors');

const router = express.Router();

// ─── Settings registry ──────────────────────────────────────
// Whitelist of editable settings with type + validation. Anything not here is
// rejected, so the key-value store can't be written with arbitrary keys.
// `secret: true` → value is set-only: it can be replaced but never read back.

const SETTINGS_SCHEMA = {
  searchThreshold:          { type: 'number', min: 0, max: 1 },
  searchMode:               { type: 'string', enum: ['sequential', 'parallel'] },
  bm25Weight:               { type: 'number', min: 0, max: 1 },
  semanticWeight:           { type: 'number', min: 0, max: 1 },
  topN:                     { type: 'number', min: 1, max: 100 },
  cronEnabled:              { type: 'boolean' },
  cronSchedule:             { type: 'string' },
  groqModel:                { type: 'string' },
  chunkingStrategy:         { type: 'string', enum: ['fixed', 'semantic', 'hierarchical'] },
  useHyde:                  { type: 'boolean' },
  groqApiKey:               { type: 'string', secret: true },
};

function validateSetting(key, value) {
  const schema = SETTINGS_SCHEMA[key];
  if (!schema) {
    throw new AppError(`Unknown setting: ${key}`, ErrorCodes.VALIDATION_FAILED, 400);
  }
  if (value == null) {
    throw new AppError(`Value required for ${key}`, ErrorCodes.VALIDATION_FAILED, 400);
  }

  if (schema.type === 'number') {
    const n = Number(value);
    if (Number.isNaN(n)) throw new AppError(`${key} must be a number`, ErrorCodes.VALIDATION_FAILED, 400);
    if (schema.min != null && n < schema.min) throw new AppError(`${key} must be ≥ ${schema.min}`, ErrorCodes.VALIDATION_FAILED, 400);
    if (schema.max != null && n > schema.max) throw new AppError(`${key} must be ≤ ${schema.max}`, ErrorCodes.VALIDATION_FAILED, 400);
    return n;
  }
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') throw new AppError(`${key} must be a boolean`, ErrorCodes.VALIDATION_FAILED, 400);
    return value;
  }
  // string
  if (schema.enum && !schema.enum.includes(value)) {
    throw new AppError(`${key} must be one of: ${schema.enum.join(', ')}`, ErrorCodes.VALIDATION_FAILED, 400);
  }
  return String(value);
}

// ─── GET /api/settings — all settings, secrets masked ───────

router.get('/', (_req, res, next) => {
  try {
    const stored = db.getAllSettings();
    const out = {};
    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
      if (schema.secret) {
        // Never echo the secret — only whether it is configured
        out[key] = stored[key] ? '********' : null;
      } else if (stored[key] !== undefined) {
        out[key] = stored[key];
      }
    }
    res.json({ settings: out });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/settings — atomic upsert of one key ──────────

router.post('/', (req, res, next) => {
  try {
    const { key, value } = req.body || {};
    if (!key) {
      throw new AppError('"key" is required', ErrorCodes.VALIDATION_FAILED, 400);
    }
    const coerced = validateSetting(key, value);
    db.setSetting(key, coerced, SETTINGS_SCHEMA[key].type);

    logger.info({ key }, 'Setting updated');
    // Do not echo secret values
    res.json({ success: true, key, value: SETTINGS_SCHEMA[key].secret ? '********' : coerced });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/settings/reset — clear all to defaults ───────

router.post('/reset', (_req, res, next) => {
  try {
    const cleared = db.resetSettings();
    logger.info({ cleared }, 'Settings reset to defaults');
    res.json({ success: true, cleared });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, SETTINGS_SCHEMA };
