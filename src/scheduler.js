'use strict';

const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const sources = require('./sources/index');
const searchEngine = require('./search-engine');
const { validateIRBatch } = require('./validation');
const fs = require('fs');
const events = require('./events');

const chunker = require('./chunker/index');

// Per-user profile vector cache: Map<userId, Float32Array>
const profileVectors = new Map();
let isRunning = false;
let scheduledTask = null;
let currentStep = null;
let cycleStartedAt = null;
let lastResult = null;

async function loadProfileForUser(userId) {
  if (profileVectors.has(userId)) return profileVectors.get(userId);

  let profile = db.getProfileByUserId(userId);

  if (!profile) {
    const profileId = config.activeProfile;
    const profilePath = config.profiles?.[profileId];
    let defaultKeywords = [];
    let defaultRawInput = '';

    if (profilePath && fs.existsSync(profilePath)) {
      const f = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      defaultKeywords = f.keywords || [];
      defaultRawInput = f.rawInput || f.keywords?.join('. ') || '';
    }

    profile = { id: `user-${userId}`, userId, keywords: defaultKeywords, rawInput: defaultRawInput, vector: null };
    db.saveProfileForUser(userId, profile);
    logger.info({ userId }, 'Profile created from defaults for new user');
  }

  let vector;
  if (profile.vector) {
    vector = searchEngine.deserializeVector(profile.vector);
  } else {
    const keywords = (profile.keywords || []).join('. ') || 'technology software';
    vector = await searchEngine.generateEmbedding(keywords);
    db.saveProfileForUser(userId, { ...profile, vector: searchEngine.serializeVector(vector) });
  }

  profileVectors.set(userId, vector);
  logger.info({ userId, keywords: (profile.keywords || []).length }, 'Profile vector loaded');
  return vector;
}

// Invalidate cached vector when a user updates their profile
function invalidateProfileCache(userId) {
  profileVectors.delete(userId);
}

async function runCycle() {
  if (isRunning) {
    logger.warn('Cycle already running, skipping');
    return { skipped: true };
  }

  isRunning = true;
  cycleStartedAt = Date.now();
  const startTime = cycleStartedAt;

  logger.info('═══ CYCLE START ═══');

  try {
    // 1. FETCH from all sources
    currentStep = 'Fetching from HN, Reddit, Djinni...';
    logger.info('Step 1: Fetching from sources...');
    const rawItems = await sources.fetchAll();
    logger.info({ count: rawItems.length }, 'Fetched items from sources');

    if (rawItems.length === 0) {
      logger.info('No items fetched, ending cycle');
      lastResult = { fetched: 0, saved: 0, chunked: 0, duration: Date.now() - startTime };
      currentStep = null;
      return { fetched: 0, validated: 0, filtered: 0, saved: 0, chunked: 0 };
    }

    // 2. VALIDATE
    currentStep = `Validating ${rawItems.length} items...`;
    logger.info('Step 2: Validating items...');
    const validItems = validateIRBatch(rawItems, logger);
    logger.info({ valid: validItems.length, dropped: rawItems.length - validItems.length }, 'Validation complete');

    // 2b. PRE-FILTER — deterministic, no embedding/LLM cost
    const preFiltered = validItems.filter((item) => {
      const content = (item.content || '').trim();
      const title = (item.metadata?.title || '').trim();
      if (content.length < 50) return false;
      if (title && title === content) return false;
      return true;
    });
    const preFilteredCount = validItems.length - preFiltered.length;
    logger.info({ passed: preFiltered.length, skipped: preFilteredCount }, 'Pre-filter complete');

    // 3. Get all registered users
    const users = db.getAllUsers();
    if (users.length === 0) {
      logger.info('No registered users - skipping corpus build');
      lastResult = { fetched: rawItems.length, saved: 0, chunked: 0, duration: Date.now() - startTime };
      currentStep = null;
      return { fetched: rawItems.length, validated: validItems.length, preFiltered: preFilteredCount, filtered: 0, saved: 0, chunked: 0 };
    }

    // 4. SAVE unique content to the shared corpus ONCE (v7.1: no owner,
    //    fingerprint = hash(content) — duplicates across sources/cycles are skipped)
    currentStep = 'Saving new items to corpus...';
    logger.info('Step 3: Saving unique content to shared corpus...');
    const newItems = [];
    for (const item of preFiltered) {
      const corpusItem = { ...item, collectionId: 'internet' };
      if (db.insertItem(corpusItem)) newItems.push(corpusItem);
    }
    const totalSaved = newItems.length;
    logger.info({ saved: totalSaved, duplicatesSkipped: preFiltered.length - totalSaved }, 'Corpus save complete');

    // 5. CHUNK + EMBED each new item exactly once.
    //    Near-dedup: a chunk almost identical (cosine > threshold) to a recent
    //    corpus chunk is not stored again (same story from HN and Reddit).
    currentStep = `Building search index for ${totalSaved} new items...`;
    logger.info('Step 4: Chunking and embedding (once per item)...');
    const chunkingConfig = db.getChunkingConfig();
    const recentVectors = db
      .getRecentInternetChunkVectors(config.dedupWindow)
      .map((blob) => searchEngine.deserializeVector(blob));
    const itemVectors = new Map();
    let totalChunked = 0;
    let nearDuplicates = 0;

    for (const item of newItems) {
      const itemVector = await searchEngine.generateEmbedding(item.content);
      itemVectors.set(item.id, itemVector);

      const chunks = await chunker.chunk(item.content, chunkingConfig.strategy, {
        chunkSize: chunkingConfig.chunk_size,
        overlap: chunkingConfig.overlap,
      });

      const chunksToSave = [];
      for (const c of chunks) {
        const vector = await searchEngine.generateEmbedding(c.content);

        const isNearDuplicate = recentVectors.some(
          (v) => searchEngine.cosineSimilarity(v, vector) > config.dedupThreshold,
        );
        if (isNearDuplicate) {
          nearDuplicates++;
          logger.info({ itemId: item.id, chunkIndex: c.chunkIndex }, 'Near-duplicate chunk skipped');
          continue;
        }

        recentVectors.push(vector);
        chunksToSave.push({
          id: `${item.id}_${c.chunkIndex}`,
          parentId: item.id,
          content: c.content,
          chunkIndex: c.chunkIndex,
          level: c.level || 'section',
          strategy: chunkingConfig.strategy,
          vector: searchEngine.serializeVector(vector),
          metadata: c.metadata || {},
        });
      }

      if (chunksToSave.length > 0) {
        db.insertChunksBatch(chunksToSave);
        totalChunked += chunksToSave.length;
      }
    }
    logger.info({ chunked: totalChunked, nearDuplicates }, 'Indexing complete');

    // 6. MATCH each user's profile against new items — cosine only, no
    //    re-embedding. Personal relevance goes to user_matches.
    let totalMatches = 0;
    // Live threshold: respects a value set via Settings (falls back to .env)
    const matchThreshold = config.live('searchThreshold');
    for (const user of users) {
      currentStep = `Matching items for ${user.email}...`;
      const userVector = await loadProfileForUser(user.id);

      let matched = 0;
      for (const item of newItems) {
        const score = searchEngine.cosineSimilarity(itemVectors.get(item.id), userVector);
        if (score >= matchThreshold) {
          db.upsertUserMatch({ userId: user.id, itemId: item.id, score, status: 'new' });
          matched++;
        }
      }
      totalMatches += matched;
      logger.info({ userId: user.id, matched, threshold: matchThreshold }, 'User matching complete');
    }

    const duration = Date.now() - startTime;
    logger.info(
      { fetched: rawItems.length, validated: validItems.length, saved: totalSaved, chunked: totalChunked, matches: totalMatches, duration: `${duration}ms` },
      '─── CYCLE END ═══',
    );

    lastResult = { fetched: rawItems.length, saved: totalSaved, chunked: totalChunked, matches: totalMatches, duration };
    currentStep = null;

    events.emit('sync.completed', { fetched: rawItems.length, saved: totalSaved, chunked: totalChunked, matches: totalMatches, duration });

    return { fetched: rawItems.length, validated: validItems.length, preFiltered: preFilteredCount, saved: totalSaved, chunked: totalChunked, matches: totalMatches, duration };
  } catch (err) {
    /* istanbul ignore next */
    logger.error({ err }, 'Cycle failed');
    /* istanbul ignore next */
    currentStep = null;
    throw err;
  } finally {
    isRunning = false;
    cycleStartedAt = null;
  }
}

/* istanbul ignore next */
function start() {
  logger.info({ schedule: config.cronSchedule, profile: config.activeProfile }, 'Scheduler starting');

  scheduledTask = cron.schedule(config.cronSchedule, async () => {
    try {
      await runCycle();
    } catch (err) {
      logger.error({ err }, 'Scheduled cycle failed');
    }
  });

  logger.info('Scheduler started');
  return scheduledTask;
}

/* istanbul ignore next */
function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

function getStatus() {
  return {
    status: scheduledTask ? 'ok' : 'stopped',
    isRunning,
    currentStep,
    cycleStartedAt,
    lastResult,
  };
}

module.exports = {
  runCycle,
  invalidateProfileCache,
  start,
  stop,
  getStatus,
};
