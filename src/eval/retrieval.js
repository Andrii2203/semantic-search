'use strict';

const constants = require('../search-constants');
const { cosineSimilarity } = require('../search-engine');
const { buildIndex, score } = require('./bm25');

function textOf(document, fields) {
  return fields.map((field) => document[field] || '').join(' ');
}

function buildLexical(documents, configuration) {
  if (configuration.multifield) {
    return configuration.fields.map((field) =>
      buildIndex(documents.map((document) => ({ content: document[field] || '' }))),
    );
  }

  return [buildIndex(documents.map((document) => ({ content: textOf(document, configuration.fields) })))];
}

function lexicalScores(index, queryText, configuration) {
  const totals = new Map();

  for (const part of index.lexical) {
    for (const [position, value] of score(part, queryText, configuration.bm25)) {
      totals.set(position, (totals.get(position) || 0) + value);
    }
  }

  return [...totals.entries()].map(([position, value]) => ({ id: index.ids[position], score: value }));
}

function denseScores(index, queryVector, candidates) {
  const pool = candidates || index.ids;

  return pool.map((id) => ({
    id,
    score: cosineSimilarity(queryVector, index.vectors.get(id)),
  }));
}

function byScore(rows) {
  return [...rows].sort((first, second) => second.score - first.score);
}

function reciprocalRankFusion(rankings, rankConstant) {
  const totals = new Map();

  for (const ranking of rankings) {
    ranking.forEach((id, position) => {
      totals.set(id, (totals.get(id) || 0) + 1 / (rankConstant + position + 1));
    });
  }

  return byScore([...totals.entries()].map(([id, value]) => ({ id, score: value })));
}

function normalise(rows) {
  if (rows.length === 0) {
    return new Map();
  }

  const values = rows.map((row) => row.score);
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const span = highest - lowest;

  return new Map(rows.map((row) => [row.id, span === 0 ? 0 : (row.score - lowest) / span]));
}

function weightedFusion(scoreLists, weights) {
  const totals = new Map();

  scoreLists.forEach((rows, listIndex) => {
    for (const [id, value] of normalise(rows)) {
      totals.set(id, (totals.get(id) || 0) + weights[listIndex] * value);
    }
  });

  return byScore([...totals.entries()].map(([id, value]) => ({ id, score: value })));
}

async function prepare(documents, configuration, embed, cached) {
  const ids = documents.map((document) => document.id);
  const index = { ids, lexical: buildLexical(documents, configuration), vectors: new Map(), embed };

  if (!configuration.branches.includes('dense')) {
    return index;
  }

  if (cached) {
    index.vectors = cached;
    return index;
  }

  for (const document of documents) {
    index.vectors.set(document.id, await embed(textOf(document, configuration.fields)));
  }

  return index;
}

async function embedQuery(index, queryText, configuration) {
  if (!configuration.branches.includes('dense')) {
    return null;
  }

  return index.embed(queryText);
}

function fuse(lexical, dense, configuration, limit) {
  if (configuration.fusion === 'weighted') {
    const weights = configuration.weights || [constants.bm25Weight, constants.semanticWeight];
    return weightedFusion([lexical, dense], weights);
  }

  const rankConstant =
    configuration.rankConstant === undefined ? constants.rrfK : configuration.rankConstant;
  const lexicalRanking = byScore(lexical).slice(0, limit).map((row) => row.id);
  const denseRanking = byScore(dense).slice(0, limit).map((row) => row.id);

  return reciprocalRankFusion([lexicalRanking, denseRanking], rankConstant);
}

function rankWith(context, configuration, limit) {
  const { index, lexical, queryVector } = context;
  const wantsLexical = configuration.branches.includes('lexical');

  if (!wantsLexical) {
    return byScore(denseScores(index, queryVector)).slice(0, limit).map((row) => row.id);
  }

  if (configuration.mode === 'sequential') {
    const candidates = byScore(lexical).slice(0, configuration.limit || limit).map((row) => row.id);
    return byScore(denseScores(index, queryVector, candidates)).slice(0, limit).map((row) => row.id);
  }

  const dense = denseScores(index, queryVector);
  return fuse(lexical, dense, configuration, configuration.limit || limit)
    .slice(0, limit)
    .map((row) => row.id);
}

async function forQuery(index, queryText, configuration, limit) {
  const wantsLexical = configuration.branches.includes('lexical');
  const lexical = wantsLexical ? lexicalScores(index, queryText, configuration) : [];

  if (!configuration.branches.includes('dense')) {
    return byScore(lexical).slice(0, limit).map((row) => row.id);
  }

  const queryVector = await embedQuery(index, queryText, configuration);

  return rankWith({ index, lexical, queryVector }, configuration, limit);
}

const retrieve = { prepare, forQuery };

module.exports = { retrieve, reciprocalRankFusion, weightedFusion, prepare, forQuery };
