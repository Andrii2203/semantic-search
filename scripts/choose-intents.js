'use strict';

// Chooses intents from the snapshot posts and writes eval/intents.json.
// No intent is invented: every one is a real post, referenced by identifier.
//
//   node scripts/choose-intents.js [count]
//
// Group A is news aligned, short posts with vocabulary the corpus shares, so they are likely
// answerable. Group B is first person self posts, likely unanswerable, and they measure what the
// system lets through when the right answer is nothing. Both groups carry both splits.
//
// See docs/plans/evaluation-corpus.md section 5.

const fs = require('fs');
const path = require('path');
const { loadPosts, EVAL_DIR } = require('../src/eval/corpus-loader');
const { countWords } = require('../src/eval/categories');

const TOTAL = parseInt(process.argv[2] || '50', 10);
const NEWS_ALIGNED_SHARE = 0.6;
const SELF_POST_MIN_WORDS = 40;

function evenlySpaced(items, wanted) {
  if (items.length <= wanted) {
    return items;
  }
  const step = items.length / wanted;
  const picked = [];
  for (let i = 0; picked.length < wanted; i += step) {
    picked.push(items[Math.floor(i)]);
  }
  return picked;
}

function alternateSplits(items) {
  return items.map((item, index) => ({
    id: item.id,
    group: item.group,
    split: index % 3 === 2 ? 'locked' : 'dev',
    title: item.metadata?.title || '',
  }));
}

function main() {
  const posts = loadPosts();

  const newsWanted = Math.round(TOTAL * NEWS_ALIGNED_SHARE);
  const selfWanted = TOTAL - newsWanted;

  const shortPosts = posts.filter((post) => post.source === 'hn_story');
  const selfPosts = posts.filter(
    (post) => post.source !== 'hn_story' && countWords(post.content) >= SELF_POST_MIN_WORDS,
  );

  const chosenShort = evenlySpaced(shortPosts, newsWanted).map((post) => ({ ...post, group: 'short-post' }));
  const chosenSelf = evenlySpaced(selfPosts, selfWanted).map((post) => ({ ...post, group: 'self-post' }));

  const items = alternateSplits([...chosenShort, ...chosenSelf]);

  fs.mkdirSync(EVAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVAL_DIR, 'intents.json'), `${JSON.stringify({ items }, null, 2)}\n`);

  const counts = {};
  for (const item of items) {
    const key = `${item.group}/${item.split}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  console.log(`Wrote ${items.length} intents to eval/intents.json`);
  console.log(JSON.stringify(counts, null, 0));
  console.log('\nsample short posts:');
  for (const post of chosenShort.slice(0, 5)) {
    console.log(`  ${String(countWords(post.content)).padStart(4)}w  ${(post.metadata.title || '').slice(0, 66)}`);
  }
  console.log('sample self posts:');
  for (const post of chosenSelf.slice(0, 5)) {
    console.log(`  ${String(countWords(post.content)).padStart(4)}w  ${(post.metadata.title || '').slice(0, 66)}`);
  }
}

main();
