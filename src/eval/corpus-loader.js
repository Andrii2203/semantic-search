'use strict';

const fs = require('fs');
const path = require('path');

const EVAL_DIR = path.resolve(__dirname, '..', '..', 'eval');
const SNAPSHOT_DIR = path.join(EVAL_DIR, 'snapshots');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function snapshotNames() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    return [];
  }
  return fs.readdirSync(SNAPSHOT_DIR).sort();
}

function loadFromSnapshots(fileName) {
  const byId = new Map();

  for (const name of snapshotNames()) {
    const payload = readJson(path.join(SNAPSHOT_DIR, name, fileName), { items: [] });
    for (const item of payload.items || []) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function loadCorpus() {
  return loadFromSnapshots('corpus.json');
}

function loadPosts() {
  return loadFromSnapshots('posts.json');
}

function loadIntents() {
  const chosen = readJson(path.join(EVAL_DIR, 'intents.json'), { items: [] });
  const posts = new Map(loadPosts().map((post) => [post.id, post]));

  return (chosen.items || [])
    .filter((entry) => posts.has(entry.id))
    .map((entry) => ({ ...posts.get(entry.id), split: entry.split }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = { loadCorpus, loadPosts, loadIntents, snapshotNames, EVAL_DIR };
