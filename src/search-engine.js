'use strict';

let pipeline = null;

/* istanbul ignore next */
async function getModel() {
  if (!pipeline) {
    const { pipeline: createPipeline, env } = await import('@huggingface/transformers');
    
    if (env.backends && env.backends.onnx) {
      env.backends.onnx.wasm.numThreads = 1;
    }
    
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipeline;
}

/* istanbul ignore next */
async function generateEmbedding(text) {
  const model = await getModel();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

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
  if (magnitude === 0) {return 0;}

  return dot / magnitude;
}

function serializeVector(arr) {
  if (!arr) {return null;}
  return Buffer.from(new Float32Array(arr).buffer);
}

function deserializeVector(blob) {
  if (!blob) {return null;}
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
}

function scoreChunksByVector(chunks, profileVector, threshold = 0.65) {
  if (!chunks || chunks.length === 0 || !profileVector) {return [];}

  const scored = [];

  for (const chunk of chunks) {
    const chunkVector =
      Array.isArray(chunk.vector) ? chunk.vector : deserializeVector(chunk.vector);

    if (!chunkVector) {continue;}

    const score = cosineSimilarity(chunkVector, profileVector);
    if (score >= threshold) {
      scored.push({ ...chunk, score, semanticScore: score });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

function mergeResults(bm25Results, semanticResults, weights = {}) {
  const { bm25Weight = 0.4, semanticWeight = 0.6 } = weights;
  const merged = new Map();

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

function rrfMerge(bm25Results, semanticResults, options = {}) {
  const k = options.k || 60;
  const merged = new Map();

  (bm25Results || []).forEach((chunk, i) => {
    merged.set(chunk.id, {
      ...chunk,
      bm25Rank: i + 1,
      semanticRank: null,
      semanticScore: chunk.semanticScore ?? null,
    });
  });

  (semanticResults || []).forEach((chunk, i) => {
    const semanticRank = i + 1;
    if (merged.has(chunk.id)) {
      const existing = merged.get(chunk.id);
      existing.semanticRank = semanticRank;
      existing.semanticScore = chunk.semanticScore;
      if (chunk.vector && !existing.vector) {existing.vector = chunk.vector;}
    } else {
      merged.set(chunk.id, { ...chunk, bm25Rank: null, semanticRank });
    }
  });

  return [...merged.values()]
    .map((chunk) => {
      const bm25Part = chunk.bm25Rank ? 1 / (k + chunk.bm25Rank) : 0;
      const semanticPart = chunk.semanticRank ? 1 / (k + chunk.semanticRank) : 0;
      const rrfScore = bm25Part + semanticPart;
      return { ...chunk, rrfScore, score: rrfScore };
    })
    .sort((a, b) => b.score - a.score);
}

function mmrSelect(chunks, options = {}) {
  const lambda = options.lambda ?? 0.5;
  const topN = options.topN || 20;

  if (!chunks || chunks.length === 0) {return [];}
  if (lambda >= 1) {return chunks.slice(0, topN);}

  const candidates = chunks.map((chunk) => ({
    chunk,
    vector: Array.isArray(chunk.vector) ? chunk.vector : deserializeVector(chunk.vector),
  }));

  const maxScore = Math.max(...chunks.map((c) => c.score || 0), 1e-9);
  const selected = [];
  const selectedVectors = [];

  while (selected.length < topN && candidates.length > 0) {
    let bestIdx = 0;
    let bestValue = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const { chunk, vector } = candidates[i];
      const relevance = (chunk.score || 0) / maxScore;

      let maxSim = 0;
      if (vector) {
        for (const sv of selectedVectors) {
          const sim = cosineSimilarity(vector, sv);
          if (sim > maxSim) {maxSim = sim;}
        }
      }

      const value = lambda * relevance - (1 - lambda) * maxSim;
      if (value > bestValue) {
        bestValue = value;
        bestIdx = i;
      }
    }

    const [picked] = candidates.splice(bestIdx, 1);
    selected.push(picked.chunk);
    if (picked.vector) {selectedVectors.push(picked.vector);}
  }

  return selected;
}

function groupByParent(chunks) {
  if (!chunks || chunks.length === 0) {return [];}

  const documentMap = new Map();

  for (const chunk of chunks) {
    const parentId = chunk.parent_id;
    if (!documentMap.has(parentId)) {
      documentMap.set(parentId, {
        parentId,
        matchedChunks: [],
        bestScore: 0,
        totalScore: 0,
        vector: null,
      });
    }

    const doc = documentMap.get(parentId);
    doc.matchedChunks.push({
      id: chunk.id,
      content: chunk.content,
      chunkIndex: chunk.chunk_index,
      score: chunk.score,
      bm25Rank: chunk.bm25Rank,
      semanticRank: chunk.semanticRank ?? null,
      rrfScore: chunk.rrfScore ?? null,
      semanticScore: chunk.semanticScore,
    });
    if (doc.vector === null || chunk.score > doc.bestScore) {
      const v = Array.isArray(chunk.vector) ? chunk.vector : deserializeVector(chunk.vector);
      if (v) {doc.vector = v;}
    }
    doc.bestScore = Math.max(doc.bestScore, chunk.score);
    doc.totalScore += chunk.score;
  }

  return [...documentMap.values()]
    .map((doc) => ({ ...doc, score: doc.bestScore }))
    .sort((a, b) => b.bestScore - a.bestScore || b.totalScore - a.totalScore)
    .map((doc) => ({
      ...doc,
      matchedChunks: doc.matchedChunks.sort((a, b) => b.score - a.score),
    }));
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  serializeVector,
  deserializeVector,
  scoreChunksByVector,
  mergeResults,
  rrfMerge,
  mmrSelect,
  groupByParent,
};
