'use strict';

const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const sources = require('./sources/index');
const searchEngine = require('./search-engine');
const { validateIRBatch } = require('./validation');
const fs = require('fs');

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
      logger.info('No registered users - skipping semantic filter and save');
      lastResult = { fetched: rawItems.length, saved: 0, chunked: 0, duration: Date.now() - startTime };
      currentStep = null;
      return { fetched: rawItems.length, validated: validItems.length, preFiltered: preFilteredCount, filtered: 0, saved: 0, chunked: 0 };
    }

    let totalSaved = 0;
    let totalChunked = 0;

    for (const user of users) {
      // 4. Load user's profile vector
      const userVector = await loadProfileForUser(user.id);

      // 5. FILTER by semantic similarity
      currentStep = `Matching items for ${user.email}...`;
      logger.info({ userId: user.id }, 'Step 3: Filtering by semantic relevance...');
      const relevant = await searchEngine.findRelevant(preFiltered, userVector, config.similarityThreshold);
      logger.info({ userId: user.id, relevant: relevant.length, threshold: config.similarityThreshold }, 'Semantic filter complete');

      // 6. SAVE relevant items with user_id
      currentStep = `Saving ${relevant.length} items for ${user.email}...`;
      logger.info({ userId: user.id }, 'Step 4: Saving relevant items...');
      const userItems = relevant.map((item) => ({ ...item, userId: user.id, collectionId: 'internet' }));
      const saved = db.insertItemsBatch(userItems);
      totalSaved += saved;
      logger.info({ userId: user.id, saved, duplicatesSkipped: relevant.length - saved }, 'Save complete');

      // 7. CHUNK AND EMBED new items only
      currentStep = `Building search index for ${saved} new items...`;
      logger.info({ userId: user.id }, 'Step 5: Chunking and embedding...');
      const chunkingConfig = db.getChunkingConfig();

      for (const item of userItems) {
        const chunks = await chunker.chunk(item.content, chunkingConfig.strategy, {
          chunkSize: chunkingConfig.chunk_size,
          overlap: chunkingConfig.overlap,
        });

        const chunksToSave = [];
        for (const c of chunks) {
          const vector = await searchEngine.generateEmbedding(c.content);
          chunksToSave.push({
            id: `${item.id}_${user.id.slice(0, 8)}_${c.chunkIndex}`,
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
    }

    const duration = Date.now() - startTime;
    logger.info(
      { fetched: rawItems.length, validated: validItems.length, saved: totalSaved, chunked: totalChunked, duration: `${duration}ms` },
      '─── CYCLE END ═══',
    );

    lastResult = { fetched: rawItems.length, saved: totalSaved, chunked: totalChunked, duration };
    currentStep = null;

    return { fetched: rawItems.length, validated: validItems.length, preFiltered: preFilteredCount, saved: totalSaved, chunked: totalChunked, duration };
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
