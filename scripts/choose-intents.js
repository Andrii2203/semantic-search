'use strict';

// Chooses candidate intents from the snapshot posts and writes eval/intents.json.
// No intent is invented: every one is a real post, referenced by identifier.
//
//   node scripts/choose-intents.js [count]
//
// Candidates are the posts whose subject the article corpus covers best, measured as the mean cosine
// of their three closest articles, plus every intent already chosen so that judgments already paid
// for are not thrown away. This script never reads the answer key. Groups and splits are assigned
// afterwards by scripts/prune-intents.js, once the pool has been judged.
//
// See docs/plans/evaluation-corpus.md section 10.1.

const fs = require('fs');
const path = require('path');

const { loadPosts, loadCorpus, EVAL_DIR } = require('../src/eval/corpus-loader');
const { rankByCoverage } = require('../src/eval/intent-coverage');
const { embedMany, loadVectors, saveVectors } = require('../src/eval/embedder');
const { DEFAULT_ROOT } = require('../src/eval/beir-loader');

const WANTED = parseInt(process.argv[2] || '80', 10);
const CACHE_DIRECTORY = path.join(DEFAULT_ROOT, 'local-news');
const POST_CACHE_DIRECTORY = path.join(DEFAULT_ROOT, 'local-posts');

async function vectorsFor(directory, items, label) {
  const ids = items.map((item) => item.id);
  const cached = loadVectors(directory, ids);

  if (cached) {
    console.log(`${label}: ${ids.length} vectors from cache`);
    return cached;
  }

  const texts = items.map((item) => `${(item.metadata || {}).title || ''} ${item.content || ''}`.trim());
  const vectors = await embedMany(texts, (done, total) => {
    if (done % 640 === 0 || done === total) {
      console.log(`  embedding ${label}: ${done} of ${total}`);
    }
  });

  saveVectors(directory, ids, vectors);
  return new Map(ids.map((id, index) => [id, vectors[index]]));
}

function existingIds() {
  const file = path.join(EVAL_DIR, 'intents.json');
  if (!fs.existsSync(file)) {
    return new Set();
  }

  return new Set((JSON.parse(fs.readFileSync(file, 'utf-8')).items || []).map((row) => row.id));
}

async function main() {
  const posts = loadPosts();
  const corpus = loadCorpus();
  console.log(`${posts.length} candidate posts against ${corpus.length} articles`);

  const articleVectors = await vectorsFor(CACHE_DIRECTORY, corpus, 'articles');
  const postVectors = await vectorsFor(POST_CACHE_DIRECTORY, posts, 'posts');

  const articles = corpus.map((article) => ({ id: article.id, vector: articleVectors.get(article.id) }));
  const ranked = rankByCoverage(posts, Object.fromEntries(postVectors), articles);

  const kept = new Set(existingIds());
  const chosen = [];

  for (const post of ranked) {
    if (chosen.length >= WANTED) {
      break;
    }
    if (!kept.has(post.id)) {
      chosen.push(post);
      kept.add(post.id);
    }
  }

  const items = [...kept].map((id) => {
    const post = posts.find((row) => row.id === id);
    const scored = ranked.find((row) => row.id === id);
    return {
      id,
      title: (post.metadata || {}).title || '',
      coverage: Number(scored.coverage.toFixed(4)),
      group: 'candidate',
      split: 'unassigned',
    };
  });

  items.sort((first, second) => first.id.localeCompare(second.id));
  fs.writeFileSync(
    path.join(EVAL_DIR, 'intent-candidates.json'),
    `${JSON.stringify({ items }, null, 2)}\n`,
  );

  const coverages = chosen.map((row) => row.coverage);
  console.log(
    `wrote ${items.length} candidate intents: ${chosen.length} newly chosen by coverage ` +
      `(${Math.min(...coverages).toFixed(3)} to ${Math.max(...coverages).toFixed(3)}), ` +
      `${items.length - chosen.length} carried over from the previous answer key`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
