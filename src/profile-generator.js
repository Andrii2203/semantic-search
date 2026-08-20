'use strict';

const crypto = require('crypto');
const { extractKeywords, extractKeywordsFallback } = require('./keyword-extractor');
const SearchEngine = require('./search-engine');
const constants = require('./search-constants');
const db = require('./db');
const logger = require('./logger');
const { AppError, ErrorCodes } = require('./errors');

async function resolveKeywords(inputText, useAI) {
  const fallback = extractKeywordsFallback(inputText);
  if (!useAI) {
    return fallback;
  }

  try {
    const aiKeywords = await extractKeywords(inputText);
    return aiKeywords.length > 0 ? aiKeywords : fallback;
  } catch (err) {
    logger.warn({ err }, 'AI keywords failed, keeping fallback');
    return fallback;
  }
}

async function safeEmbedding(inputText) {
  try {
    return await SearchEngine.generateEmbedding(inputText, 'query');
  } catch (err) {
    logger.warn({ err }, 'Embedding generation failed for profile');
    return null;
  }
}

function vectorOrigin(vector) {
  if (!vector) {
    return { vector: null, model: null, dimensions: null };
  }

  return {
    vector: SearchEngine.serializeVector(vector),
    model: constants.embeddingModel,
    dimensions: vector.length,
  };
}

async function fromText(inputText, options = {}) {
  if (!inputText || typeof inputText !== 'string' || inputText.trim().length < 5) {
    throw new AppError('Input text too short for profile generation', ErrorCodes.PROFILE_ERROR, 400);
  }

  const { useAI = true, save = false } = options;
  const id = 'prof_' + crypto.createHash('sha256').update(inputText).digest('hex').slice(0, 12);

  const keywords = await resolveKeywords(inputText, useAI);
  const vector = await safeEmbedding(inputText);

  const profile = {
    id,
    keywords,
    ...vectorOrigin(vector),
    rawInput: inputText,
    createdAt: new Date().toISOString(),
  };

  if (save) {
    db.saveProfile(profile);
    logger.info({ profileId: id, keywordCount: keywords.length }, 'Profile saved');
  }

  return profile;
}

function loadProfile(profileId, userId) {
  const profile = db.getProfile(profileId, userId);
  if (!profile) {
    throw new AppError(`Profile not found: ${profileId}`, ErrorCodes.NOT_FOUND, 404);
  }
  return profile;
}

module.exports = { fromText, loadProfile };
