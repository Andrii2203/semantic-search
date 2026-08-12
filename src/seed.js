'use strict';

const db = require('./db');
const SearchEngine = require('./search-engine');
const { chunk } = require('./chunker');
const logger = require('./logger');

// ─── Synthetic eval dataset (Phase 2.5) ─────────────────────
//
// The "Henry Ford bench": a labelled set that lets us measure whether hybrid
// search ranks correctly for the query "rust async". Each post carries an
// expected `group` — this is the definition of correctness, not decoration.
//
// Stored under collection_id '__test__' (owner-scoped) so it never mixes with
// real internet/files data.

const SEED_COLLECTION = '__test__';

const SEED_POSTS = [
  // ── exact: query terms present, topic on point → expect top ──
  { group: 'exact', title: 'Async Rust: tokio vs async-std', content: 'A deep comparison of async Rust runtimes. tokio and async-std both provide async/await executors; we benchmark task scheduling, latency and throughput in production Rust services.' },
  { group: 'exact', title: 'Understanding async/await in Rust', content: 'How the Rust async model works: futures, the Future trait, pinning, and how the tokio runtime polls tasks. A practical guide to writing asynchronous Rust code.' },
  { group: 'exact', title: 'Building a high-performance async web server in Rust', content: 'We build an async HTTP server in Rust using tokio and hyper, covering non-blocking IO, async tasks, and concurrency for thousands of connections.' },

  // ── semantic: same idea, query words absent → expect top-10 ──
  { group: 'semantic', title: 'Coroutines in systems programming', content: 'Lightweight cooperative concurrency with coroutines lets systems software handle many concurrent tasks without OS threads. We discuss green threads, executors and non-blocking scheduling.' },
  { group: 'semantic', title: 'Non-blocking concurrency with futures and executors', content: 'A look at how futures, executors and event loops enable thousands of concurrent tasks in low-level languages without blocking threads.' },
  { group: 'semantic', title: 'Green threads and cooperative scheduling', content: 'Cooperative multitasking schedules many lightweight tasks onto few OS threads, polling each until it yields. Used by modern concurrent runtimes.' },

  // ── partial: adjacent topic, shares one dimension → mid range ──
  { group: 'partial', title: 'Python asyncio tutorial', content: 'Learn asynchronous programming in Python with asyncio: the event loop, coroutines with async/await, and awaiting IO-bound tasks concurrently.' },
  { group: 'partial', title: 'JavaScript promises and async/await', content: 'Asynchronous JavaScript explained: promises, async functions, await, and the event loop that drives non-blocking IO in Node.js.' },
  { group: 'partial', title: 'Go goroutines and channels', content: 'Concurrency in Go uses goroutines and channels for communicating sequential processes. A practical introduction to concurrent Go programs.' },

  // ── irrelevant: different domain entirely → expect bottom ──
  { group: 'irrelevant', title: 'Best JavaScript frameworks 2024', content: 'A roundup of the most popular frontend JavaScript frameworks this year: React, Vue, Svelte and Angular, with pros and cons for building user interfaces.' },
  { group: 'irrelevant', title: 'Top 10 sourdough bread recipes', content: 'Bake the perfect sourdough loaf at home: starter maintenance, hydration ratios, proofing times and scoring techniques for a crispy crust.' },
  { group: 'irrelevant', title: 'A beginner guide to watercolor painting', content: 'Start painting with watercolors: choosing brushes, mixing pigments, wet-on-wet techniques and composing your first landscape.' },
  { group: 'irrelevant', title: 'Hiking the Pacific Crest Trail', content: 'Everything you need to thru-hike the PCT: gear lists, resupply strategy, water sources and physical preparation for 2650 miles.' },

  // ── trap: keyword "rust" present, but wrong meaning → not top-5 ──
  { group: 'trap', title: 'How to remove rust from old tools', content: 'Restore rusty hand tools: soak metal in vinegar to dissolve rust, scrub corrosion with steel wool, then oil the surface to prevent oxidation and further rusting.' },
  { group: 'trap', title: 'Preventing rust on your car body', content: 'Rust is the enemy of car bodywork. Learn how moisture and salt cause iron oxide corrosion, and how rustproofing coatings protect metal panels.' },
  { group: 'trap', title: 'Rust belt: the decline of American manufacturing', content: 'The Rust Belt region saw factories close as heavy industry declined. An economic history of steel towns, job losses and urban decay.' },
];

// IDs are namespaced per user — the seed set is private and isolated, so the
// same post for two users must be two distinct rows (ids are the PRIMARY KEY).
function postId(post, i, userId) {
  return `seed_${(userId || 'anon').slice(0, 8)}_${post.group}_${i}`;
}

/**
 * Insert (or refresh) the synthetic eval dataset for a user.
 * Clears any previous __test__ items for this user first.
 *
 * @param {string} userId
 * @returns {Promise<{ inserted: number, chunks: number }>}
 */
async function seedTestData(userId) {
  // Clear previous seed items for this user (and their chunks via CASCADE-less manual delete)
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
      metadata: { title: post.title, group: post.group },
      collectionId: SEED_COLLECTION,
      userId,
    });
    if (!ok) continue;
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
