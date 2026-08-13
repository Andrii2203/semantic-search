'use strict';

const db = require('./db');
const SearchEngine = require('./search-engine');
const { chunk } = require('./chunker');
const logger = require('./logger');

const SEED_COLLECTION = '__test__';

const { ITEMS } = require('./seed-dataset');

const SEED_POSTS = ITEMS;

function postId(post, i, userId) {
  return `seed_${(userId || 'anon').slice(0, 8)}_${post.group}_${i}`;
}

async function seedTestData(userId) {
  const existing = db.getItems({ collectionId: SEED_COLLECTION, userId, limit: 1000 });
  for (const item of existing) {
    db.deleteChunksByParent(item.id);
    db.deleteItem(item.id);
  }

  let inserted = 0;
  let chunksCreated = 0;

  for (let i = 0; i < SEED_POSTS.length; i++) {
    const post = SEED_POSTS[i];
    const id = postId(post, i, userId);

    const ok = db.insertItem({
      id,
      content: post.content,
      type: 'post',
      source: 'seed',
      metadata: { title: post.title, group: post.group, intent: post.intent, split: post.split },
      collectionId: SEED_COLLECTION,
      userId,
    });
    if (!ok) {continue;}
    inserted++;

    const chunks = await chunk(post.content, 'fixed', { chunkSize: 200, overlap: 0 });
    for (const c of chunks) {
      let vector = null;
      try {
        const embedding = await SearchEngine.generateEmbedding(c.content);
        vector = SearchEngine.serializeVector(embedding);
      } catch (err) {
        logger.warn({ err, id }, 'Seed embedding failed');
      }
      db.insertChunk({
        id: `${id}_${c.chunkIndex}`,
        parentId: id,
        content: c.content,
        chunkIndex: c.chunkIndex,
        level: c.level || 'section',
        strategy: c.strategy,
        vector,
        metadata: c.metadata || {},
      });
      chunksCreated++;
    }
  }

  logger.info({ userId, inserted, chunks: chunksCreated }, 'Seed test data inserted');
  return { inserted, chunks: chunksCreated };
}

module.exports = { seedTestData, SEED_POSTS, SEED_COLLECTION };
