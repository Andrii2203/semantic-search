'use strict';

/**
 * SearchEngine — isolated module.
 * Does NOT import any other project modules.
 * Works with raw data and returns filtered/scored results.
 *
 * All DB interactions, chunking, and profile loading happen OUTSIDE this module.
 * Callers pass in data; SearchEngine processes and returns results.
 */

let pipeline = null;

// ─── Model Loading ──────────────────────────────────────────

/* istanbul ignore next */
async function getModel() {
  if (!pipeline) {
    // We import the browser bundle directly to completely bypass the Node.js 
    // entry point. The Node.js entry point has a hardcoded import for 'onnxruntime-node', 
    // which crashes on Windows if C++ redistributables are missing.
    const { pipeline: createPipeline, env } = await import('@huggingface/transformers');
    
    // Configure WASM backend
    if (env.backends && env.backends.onnx) {
      env.backends.onnx.wasm.numThreads = 1;
    }
    
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

// ─── Vector Math ────────────────────────────────────────────

/**
 * Cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} — similarity score between -1 and 1
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) {
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
  if (magnitude === 0) return 0;

  return dot / magnitude;
}

// ─── Vector Serialization ───────────────────────────────────

/**
 * Serialize a number array to a Buffer (Float32Array).
 * @param {number[]} arr
 * @returns {Buffer|null}
 */
function serializeVector(arr) {
  if (!arr) return null;
  return Buffer.from(new Float32Array(arr).buffer);
}

/**
 * Deserialize a Buffer back to a number array.
 * @param {Buffer} blob
 * @returns {number[]|null}
 */
function deserializeVector(blob) {
  if (!blob) return null;
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
}

// ─── Scoring Functions ──────────────────────────────────────

/**
 * Score chunks by cosine similarity against a profile vector.
 * Pure function: takes data in, returns scored data out.
 *
 * @param {Object[]} chunks - Array of { id, content, vector (Buffer/Array), ...rest }
 * @param {number[]} profileVector - Pre-computed embedding vector for the query
 * @param {number} threshold - Minimum cosine similarity (0.0 – 1.0)
 * @returns {Object[]} Chunks that pass threshold, with score added, sorted desc
 */
function scoreChunksByVector(chunks, profileVector, threshold = 0.65) {
  if (!chunks || chunks.length === 0 || !profileVector) return [];

  const scored = [];

  for (const chunk of chunks) {
    const chunkVector =
      Array.isArray(chunk.vector) ? chunk.vector : deserializeVector(chunk.vector);

    if (!chunkVector) continue;

    const score = cosineSimilarity(chunkVector, profileVector);
    if (score >= threshold) {
      scored.push({ ...chunk, score, semanticScore: score });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

// ─── Merge Results ──────────────────────────────────────────

/**
 * Merge BM25 and semantic results with weighted scoring.
 * Deduplicates by chunk ID. Pure function.
 *
 * @param {Object[]} bm25Results - Chunks from BM25 search (with .rank)
 * @param {Object[]} semanticResults - Chunks from semantic search (with .semanticScore)
 * @param {Object} weights - { bm25Weight, semanticWeight }
 * @returns {Object[]} Merged and deduplicated chunks, sorted by combined score
 */
function mergeResults(bm25Results, semanticResults, weights = {}) {
  const { bm25Weight = 0.4, semanticWeight = 0.6 } = weights;
  const merged = new Map();

  // Normalize BM25 scores to 0-1 range
  const maxBm25Rank = Math.max(...bm25Results.map((r) => Math.abs(r.rank || 0)), 1);

  for (const chunk of bm25Results) {
    const normalizedBm25 = 1 - Math.abs(chunk.rank || 0) / maxBm25Rank;
    merged.set(chunk.id, {
      ...chunk,
      bm25Score: normalizedBm25,
      semanticScore: 0,
      score: normalizedBm25 * bm25Weight,
      bm25Rank: chunk.rank || 0,
    });
  }

  for (const chunk of semanticResults) {
    if (merged.has(chunk.id)) {
      const existing = merged.get(chunk.id);
      existing.semanticScore = chunk.semanticScore;
      existing.score = existing.bm25Score * bm25Weight + chunk.semanticScore * semanticWeight;
    } else {
      merged.set(chunk.id, {
        ...chunk,
        bm25Score: 0,
        score: (chunk.semanticScore || 0) * semanticWeight,
        bm25Rank: null,
      });
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score);
}

// ─── Group by Parent Document ───────────────────────────────

/**
 * Group scored chunks by their parent document.
 * Returns documents sorted by best chunk score. Pure function.
 *
 * @param {Object[]} chunks - Scored chunks with parent_id field
 * @returns {Object[]} Documents with matchedChunks and bestScore
 */
function groupByParent(chunks) {
  if (!chunks || chunks.length === 0) return [];

  const documentMap = new Map();

  for (const chunk of chunks) {
    const parentId = chunk.parent_id;
    if (!documentMap.has(parentId)) {
      documentMap.set(parentId, {
        parentId,
        matchedChunks: [],
        bestScore: 0,
        totalScore: 0,
      });
    }

    const doc = documentMap.get(parentId);
    doc.matchedChunks.push({
      id: chunk.id,
      content: chunk.content,
      chunkIndex: chunk.chunk_index,
      score: chunk.score,
      bm25Rank: chunk.bm25Rank,
      semanticScore: chunk.semanticScore,
    });
    doc.bestScore = Math.max(doc.bestScore, chunk.score);
    doc.totalScore += chunk.score;
  }

  return [...documentMap.values()]
    .sort((a, b) => b.bestScore - a.bestScore || b.totalScore - a.totalScore)
    .map((doc) => ({
      ...doc,
      matchedChunks: doc.matchedChunks.sort((a, b) => b.score - a.score),
    }));
}

// ─── Legacy: Simple Semantic Search ─────────────────────────

/**
 * Find relevant items from a batch using semantic similarity.
 * Original isolated interface from v4.
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

  const embeddings = await Promise.all(
    dataBatch.map(async (item) => {
      try {
        const vector = await module.exports.generateEmbedding(item.content);
        return { item, vector, ok: true };
      } catch {
        return { item, vector: [0], ok: false };
      }
    }),
  );

  const scored = [];

  for (const { item, vector, ok } of embeddings) {
    if (!ok) continue;

    const score = cosineSimilarity(vector, profileVector);
    if (score >= threshold) {
      scored.push({ ...item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  serializeVector,
  deserializeVector,
  scoreChunksByVector,
  mergeResults,
  groupByParent,
  findRelevant,
};
