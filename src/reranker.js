'use strict';

const { getGroqClient } = require('./groq-client');
const logger = require('./logger');

// ─── Reranker ───────────────────────────────────────────────

/**
 * Rerank top-N results using AI relevance scoring.
 * Each (query, result) pair gets a relevance score from 0 to 1.
 *
 * @param {Object[]} results - Search results to rerank
 * @param {string} originalQuery - The original search query
 * @param {number} topN - How many results to rerank (default 20)
 * @returns {Promise<Object[]>} Reranked results with rerankScore
 */
async function rerank(results, originalQuery, topN = 20) {
  if (!results || results.length === 0) return [];
  if (!originalQuery || originalQuery.trim().length === 0) return results;

  const toRerank = results.slice(0, topN);
  const rest = results.slice(topN);

  const groq = getGroqClient();
  const scored = [];

  // Process in small batches to reduce API calls
  const batchSize = 5;
  for (let i = 0; i < toRerank.length; i += batchSize) {
    const batch = toRerank.slice(i, i + batchSize);

    try {
      const batchScores = await scoreBatch(groq, originalQuery, batch);
      scored.push(...batchScores);
    } catch (err) {
      logger.warn({ err, batchIndex: i }, 'Rerank batch failed, keeping original scores');
      scored.push(...batch.map((item) => ({ ...item, rerankScore: item.score || 0 })));
    }
  }

  // Sort by rerankScore descending
  scored.sort((a, b) => b.rerankScore - a.rerankScore);

  // Append non-reranked items at the end
  return [...scored, ...rest.map((item) => ({ ...item, rerankScore: 0 }))];
}

/**
 * Score a batch of items against the query using Groq.
 */
async function scoreBatch(groq, query, items) {
  const itemTexts = items
    .map((item, i) => `[${i}] ${(item.content || '').slice(0, 500)}`)
    .join('\n---\n');

  const response = await groq.chat(
    [
      {
        role: 'system',
        content:
          'You are a relevance scoring engine. Score each document against the query on a scale of 0.0 to 1.0. ' +
          'Return ONLY a JSON array of numbers (scores), in the same order as the documents. No explanation.',
      },
      {
        role: 'user',
        content: `Query: ${query.slice(0, 500)}\n\nDocuments:\n${itemTexts}`,
      },
    ],
    { maxTokens: 128, temperature: 0.1 },
  );

  try {
    const scores = JSON.parse(response.trim());
    if (Array.isArray(scores) && scores.length === items.length) {
      return items.map((item, i) => ({
        ...item,
        rerankScore: Math.max(0, Math.min(1, Number(scores[i]) || 0)),
      }));
    }
  } catch {
    // Parse failed
  }

  // Fallback: keep original scores
  return items.map((item) => ({ ...item, rerankScore: item.score || 0 }));
}

module.exports = { rerank };
