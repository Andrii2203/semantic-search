'use strict';

const db = require('./db');
const searchEngine = require('./search-engine');
const scheduler = require('./scheduler');
const logger = require('./logger');
const constants = require('./search-constants');

const ACTION_WEIGHTS = {
  star: constants.feedbackWeightStar,
  approve: constants.feedbackWeightApprove,
  skip: constants.feedbackWeightSkip,
};

function averageVectors(vectors) {
  const result = new Float32Array(vectors[0].length);
  for (const v of vectors) {
    for (let i = 0; i < result.length; i++) {result[i] += v[i];}
  }
  for (let i = 0; i < result.length; i++) {result[i] /= vectors.length;}
  return result;
}

function normalize(vector) {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {norm += vector[i] * vector[i];}
  norm = Math.sqrt(norm);
  if (norm === 0) {return vector;}
  const result = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {result[i] = vector[i] / norm;}
  return result;
}

function modelOfProfile(profile) {
  return profile.model || constants.embeddingModel;
}

async function getItemVector(item, model) {
  const chunks = db.getChunksByParent(item.id).filter((c) => c.vector);
  const ofModel = chunks.filter((c) => c.model === model);

  if (ofModel.length > 0) {
    return averageVectors(ofModel.map((c) => searchEngine.deserializeVector(c.vector)));
  }

  if (chunks.length > 0) {
    logger.warn(
      { itemId: item.id, profileModel: model, itemModel: chunks[0].model },
      'Feedback ignored, the item was embedded by another model',
    );
    return null;
  }

  return searchEngine.generateEmbedding(item.content, 'document');
}

async function applyFeedback(userId, item, action) {
  const weight = ACTION_WEIGHTS[action];
  if (!weight || !userId || !item) {return false;}

  const profile = db.getProfileByUserId(userId);
  if (!profile || !profile.vector) {return false;}

  const model = modelOfProfile(profile);
  const current = searchEngine.deserializeVector(profile.vector);
  const itemVector = await getItemVector(item, model);
  if (!itemVector || itemVector.length !== current.length) {return false;}

  const blended = new Float32Array(current.length);
  const keep = 1 - Math.abs(weight);
  for (let i = 0; i < current.length; i++) {
    blended[i] = keep * current[i] + weight * itemVector[i];
  }

  db.saveProfileForUser(userId, {
    keywords: profile.keywords,
    rawInput: profile.raw_input,
    vector: searchEngine.serializeVector(normalize(blended)),
    model,
    dimensions: blended.length,
  });
  scheduler.invalidateProfileCache(userId);

  logger.info({ userId, action, itemId: item.id, weight }, 'Profile vector updated via feedback');
  return true;
}

module.exports = { applyFeedback, ACTION_WEIGHTS };
