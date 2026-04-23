'use strict';

let pipeline = null;

/**
 * SearchEngine — isolated module.
 * Does NOT import any other project modules.
 * Works with raw IR objects and returns filtered results.
 */

/**
 * Lazily loads the embedding model.
 */
/* istanbul ignore next */
async function getModel() {
  if (!pipeline) {
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipeline;
}

/**
 * Generate embedding vector for a text string.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
/* istanbul ignore next */
async function generateEmbedding(text) {
  const model = await getModel();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} — similarity score between -1 and 1
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);

  if (magnitude === 0) {
    return 0;
  }

  return dot / magnitude;
}

/**
 * Find relevant items from a batch using semantic similarity.
 *
 * @param {Object[]}  dataBatch     — array of IR objects with `content` field
 * @param {number[]}  profileVector — pre-computed embedding vector for the profile
 * @param {number}    threshold     — minimum cosine similarity (0.0 – 1.0)
 * @returns {Promise<Object[]>} — items that pass the threshold, sorted by score desc
 */
async function findRelevant(dataBatch, profileVector, threshold = 0.35) {
  if (!dataBatch || dataBatch.length === 0) {
    return [];
  }

  const scored = [];

  for (const item of dataBatch) {
    const itemVector = await module.exports.generateEmbedding(item.content);
    const score = cosineSimilarity(itemVector, profileVector);

    if (score >= threshold) {
      scored.push({ ...item, score });
    }
  }

  // Sort by score descending (most relevant first)
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  findRelevant,
};
