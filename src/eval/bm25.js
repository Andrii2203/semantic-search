'use strict';

const constants = require('../search-constants');

const STOP_WORDS = new Set(
  ('the a an and or but in on at to for of with by from is are was were be been this that it its as ' +
    'we you they has have had will would can new more most all about how why what when said')
    .split(' '),
);

function tokenize(text) {
  return ((text || '').toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || []).filter(
    (word) => !STOP_WORDS.has(word),
  );
}

function buildIndex(documents) {
  const postings = new Map();
  const lengths = [];

  documents.forEach((document, position) => {
    const terms = tokenize(document.content);
    lengths.push(terms.length);

    const counts = new Map();
    for (const term of terms) {
      counts.set(term, (counts.get(term) || 0) + 1);
    }

    for (const [term, count] of counts) {
      if (!postings.has(term)) {
        postings.set(term, []);
      }
      postings.get(term).push({ position, count });
    }
  });

  const averageLength = lengths.reduce((sum, value) => sum + value, 0) / (lengths.length || 1);

  return { postings, lengths, averageLength, size: documents.length };
}

function score(index, queryText) {
  const { postings, lengths, averageLength, size } = index;
  const scores = new Map();

  for (const term of new Set(tokenize(queryText))) {
    const list = postings.get(term);
    if (!list) {
      continue;
    }

    const inverseFrequency = Math.log(1 + (size - list.length + 0.5) / (list.length + 0.5));

    for (const { position, count } of list) {
      const normalised =
        constants.bm25K1 * (1 - constants.bm25B + (constants.bm25B * lengths[position]) / averageLength);
      const contribution = (inverseFrequency * count * (constants.bm25K1 + 1)) / (count + normalised);
      scores.set(position, (scores.get(position) || 0) + contribution);
    }
  }

  return scores;
}

function topPositions(index, queryText, limit) {
  return [...score(index, queryText).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([position, value]) => ({ position, score: value }));
}

module.exports = { buildIndex, score, topPositions, tokenize };
