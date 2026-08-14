'use strict';

const { cosineSimilarity } = require('../search-engine');

const COVERAGE_NEIGHBOURS = 3;

function coverageOf(vector, articles) {
  const closest = articles
    .map((article) => cosineSimilarity(vector, article.vector))
    .sort((first, second) => second - first)
    .slice(0, COVERAGE_NEIGHBOURS);

  return closest.reduce((total, value) => total + value, 0) / (closest.length || 1);
}

function rankByCoverage(posts, vectors, articles) {
  return posts
    .map((post) => ({ ...post, coverage: coverageOf(vectors[post.id], articles) }))
    .sort((first, second) => second.coverage - first.coverage);
}

module.exports = { rankByCoverage, COVERAGE_NEIGHBOURS };
