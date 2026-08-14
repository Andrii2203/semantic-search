'use strict';

// Builds eval/pool.json, the set of pairs worth judging.
//
//   node scripts/build-pool.js
//
// For every intent the pool is the union of the top results from two candidate generators, lexical
// and semantic. Judging the pool instead of every pair is the method TREC has used since the
// nineties. The bias it carries is recorded in docs/plans/evaluation-corpus.md section 8.

const fs = require('fs');
const path = require('path');
const { loadCorpus, loadIntents, EVAL_DIR } = require('../src/eval/corpus-loader');
const { buildIndex, topPositions } = require('../src/eval/bm25');
const searchEngine = require('../src/search-engine');
const constants = require('../src/search-constants');

const EMBED_WORDS = 220;

function firstWords(text, count) {
  return text.split(/\s+/).filter(Boolean).slice(0, count).join(' ');
}

async function embedAll(items, label) {
  const vectors = [];
  for (let i = 0; i < items.length; i++) {
    vectors.push(await searchEngine.generateEmbedding(firstWords(items[i].content, EMBED_WORDS)));
    if (i % 100 === 0) {
      process.stdout.write(`  ${label} ${i}/${items.length}\r`);
    }
  }
  console.log(`  ${label} ${items.length}/${items.length}`.padEnd(40));
  return vectors;
}

function topSemantic(intentVector, articleVectors, limit) {
  return articleVectors
    .map((vector, position) => ({ position, score: searchEngine.cosineSimilarity(intentVector, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function main() {
  const corpus = loadCorpus();
  const intents = loadIntents();
  console.log(`${intents.length} intents against ${corpus.length} articles, pool depth ${constants.poolDepth}\n`);

  const index = buildIndex(corpus);
  const articleVectors = await embedAll(corpus, 'embedding articles');
  const intentVectors = await embedAll(intents, 'embedding intents ');

  const pairs = new Map();

  intents.forEach((intent, i) => {
    const lexical = topPositions(index, intent.content, constants.poolDepth);
    const semantic = topSemantic(intentVectors[i], articleVectors, constants.poolDepth);

    for (const [source, hits] of [['bm25', lexical], ['semantic', semantic]]) {
      for (const hit of hits) {
        const article = corpus[hit.position];
        const key = `${intent.id}::${article.id}`;
        if (!pairs.has(key)) {
          pairs.set(key, { intentId: intent.id, articleId: article.id, sources: [] });
        }
        pairs.get(key).sources.push(source);
      }
    }
  });

  const items = [...pairs.values()].sort(
    (a, b) => a.intentId.localeCompare(b.intentId) || a.articleId.localeCompare(b.articleId),
  );

  fs.writeFileSync(path.join(EVAL_DIR, 'pool.json'), `${JSON.stringify({ poolDepth: constants.poolDepth, items }, null, 2)}\n`);

  const bothCount = items.filter((item) => new Set(item.sources).size === 2).length;
  console.log(`\nPool: ${items.length} pairs, ${(items.length / intents.length).toFixed(1)} per intent`);
  console.log(`Found by both generators: ${bothCount}, by one only: ${items.length - bothCount}`);
}

main().catch((err) => {
  console.error('POOL FAILED:', err.message);
  process.exit(1);
});
