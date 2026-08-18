'use strict';

const logger = require('./logger');
const constants = require('./search-constants');

/* istanbul ignore next */
function loadedScorer() {
  return require('./cross-encoder').scoreAll;
}

function probability(logit) {
  return 1 / (1 + Math.exp(-logit));
}

async function rerank(results, originalQuery, options = {}) {
  if (!results || results.length === 0) {return [];}
  if (!originalQuery || originalQuery.trim().length === 0) {return results;}

  const depth = options.depth || constants.rerankDepth;
  const head = results.slice(0, depth);
  const tail = results.slice(depth);

  let scores;
  try {
    const scoreAll = options.scoreAll || loadedScorer();
    scores = await scoreAll(originalQuery, head.map((entry) => entry.content || ''));
  } catch (err) {
    logger.warn({ err, depth: head.length }, 'Rerank failed, keeping the fused order');
    return results;
  }

  const reordered = head
    .map((entry, position) => ({ entry, logit: scores[position] }))
    .sort((first, second) => second.logit - first.logit)
    .map((scored) => ({ ...scored.entry, rerankScore: probability(scored.logit) }));

  return [...reordered, ...tail.map((entry) => ({ ...entry, rerankScore: null }))];
}

module.exports = { rerank };
