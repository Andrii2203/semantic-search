'use strict';

const db = require('./db');
const searchEngine = require('./search-engine');
const scheduler = require('./scheduler');
const logger = require('./logger');

// Phase 2.5 feedback loop: user actions slowly shift the profile vector.
// new_profile = (1 - |w|) * current + w * item_vector  (negative w pushes away)
const ACTION_WEIGHTS = {
  star: 0.15,
  approve: 0.1,
  skip: -0.05,
};

function averageVectors(vectors) {
  const result = new Float32Array(vectors[0].length);
  for (const v of vectors) {
    for (let i = 0; i < result.length; i++) result[i] += v[i];
  }
  for (let i = 0; i < result.length; i++) result[i] /= vectors.length;
  return result;
}

function normalize(vector) {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  const result = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) result[i] = vector[i] / norm;
  return result;
}

// Item vector = average of its stored chunk vectors; falls back to embedding
// the content directly when the item has no indexed chunks
async function getItemVector(item) {
  const chunkVectors = db
    .getChunksByParent(item.id)
    .filter((c) => c.vector)
    .map((c) => searchEngine.deserializeVector(c.vector));

  if (chunkVectors.length > 0) return averageVectors(chunkVectors);
  return searchEngine.generateEmbedding(item.content);
}

async function applyFeedback(userId, item, action) {
  const weight = ACTION_WEIGHTS[action];
  if (!weight || !userId || !item) return false;

  const profile = db.getProfileByUserId(userId);
  if (!profile || !profile.vector) return false;

  const current = searchEngine.deserializeVector(profile.vector);
  const itemVector = await getItemVector(item);
  if (!itemVector || itemVector.length !== current.length) return false;

  const blended = new Float32Array(current.length);
  const keep = 1 - Math.abs(weight);
  for (let i = 0; i < current.length; i++) {
    blended[i] = keep * current[i] + weight * itemVector[i];
  }

  db.saveProfileForUser(userId, {
    keywords: profile.keywords,
    rawInput: profile.raw_input,
    vector: searchEngine.serializeVector(normalize(blended)),
  });
  scheduler.invalidateProfileCache(userId);

  logger.info({ userId, action, itemId: item.id, weight }, 'Profile vector updated via feedback');
  return true;
}

module.exports = { applyFeedback, ACTION_WEIGHTS };
