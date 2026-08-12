'use strict';

const crypto = require('crypto');
const { extractKeywords, extractKeywordsFallback } = require('./keyword-extractor');
const SearchEngine = require('./search-engine');
const db = require('./db');
const logger = require('./logger');
const { AppError, ErrorCodes } = require('./errors');

async function fromText(inputText, options = {}) {
  if (!inputText || typeof inputText !== 'string' || inputText.trim().length < 5) {
    throw new AppError('Input text too short for profile generation', ErrorCodes.PROFILE_ERROR, 400);
  }

  const { useAI = true, save = false } = options;
  const id = 'prof_' + crypto.createHash('sha256').update(inputText).digest('hex').slice(0, 12);

  let keywords;
  if (useAI) {
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

  if (save) {
    db.saveProfile(profile);
    logger.info({ profileId: id, keywordCount: keywords.length }, 'Profile saved');
  }

  return profile;
}

function loadProfile(profileId) {
  const profile = db.getProfile(profileId);
  if (!profile) {
    throw new AppError(`Profile not found: ${profileId}`, ErrorCodes.NOT_FOUND, 404);
  }
  return profile;
}

module.exports = { fromText, loadProfile };
