'use strict';

const crypto = require('crypto');
const { extractKeywords, extractKeywordsFallback } = require('./keyword-extractor');
const SearchEngine = require('./search-engine');
const db = require('./db');
const logger = require('./logger');
const { AppError, ErrorCodes } = require('./errors');

// ─── Profile Generator ──────────────────────────────────────

/**
 * Generate a search profile from free-form text input.
 * Creates keywords (via AI) and an embedding vector.
 *
 * @param {string} inputText - Job description, query, etc.
 * @param {Object} options
 * @param {boolean} options.useAI - Use AI for keywords (default true)
 * @param {boolean} options.save - Save profile to DB (default false)
 * @returns {Promise<Object>} Profile object
 */
async function fromText(inputText, options = {}) {
  if (!inputText || typeof inputText !== 'string' || inputText.trim().length < 5) {
    throw new AppError('Input text too short for profile generation', ErrorCodes.PROFILE_ERROR, 400);
  }

  const { useAI = true, save = false } = options;
  const id = 'prof_' + crypto.createHash('sha256').update(inputText).digest('hex').slice(0, 12);

  // Step 1: Extract keywords
  let keywords;
  if (useAI) {
    // Start with fallback (instant), then try AI
    keywords = extractKeywordsFallback(inputText);
    try {
      const aiKeywords = await extractKeywords(inputText);
      if (aiKeywords.length > 0) {
        keywords = aiKeywords;
      }
    } catch (err) {
      logger.warn({ err }, 'AI keywords failed, keeping fallback');
    }
  } else {
    keywords = extractKeywordsFallback(inputText);
  }

  // Step 2: Generate embedding vector
  let vector = null;
  try {
    vector = await SearchEngine.generateEmbedding(inputText);
  } catch (err) {
    logger.warn({ err }, 'Embedding generation failed for profile');
  }

  const profile = {
    id,
    keywords,
    vector: vector ? SearchEngine.serializeVector(vector) : null,
    rawInput: inputText,
    createdAt: new Date().toISOString(),
  };

  // Step 3: Optionally save to DB
  if (save) {
    db.saveProfile(profile);
    logger.info({ profileId: id, keywordCount: keywords.length }, 'Profile saved');
  }

  return profile;
}

/**
 * Load a saved profile from DB.
 */
function loadProfile(profileId) {
  const profile = db.getProfile(profileId);
  if (!profile) {
    throw new AppError(`Profile not found: ${profileId}`, ErrorCodes.NOT_FOUND, 404);
  }
  return profile;
}

module.exports = { fromText, loadProfile };
