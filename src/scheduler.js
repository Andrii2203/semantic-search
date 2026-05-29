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

let profileVector = null;
let isRunning = false;
let scheduledTask = null;

/**
 * Load and cache the active profile vector.
 */
async function loadProfile() {
  const profileId = config.activeProfile;
  let profile = db.getProfile(profileId);
  
  if (!profile) {
    const profilePath = config.profiles?.[profileId];
    if (!profilePath || !fs.existsSync(profilePath)) {
      throw new Error(`Profile not found in DB or filesystem: ${profileId}`);
    }
    
    const fileProfile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    profile = {
      id: profileId,
      keywords: fileProfile.keywords || [],
      rawInput: fileProfile.rawInput || fileProfile.keywords?.join('. ') || '',
      vector: null
    };
    
    db.saveProfile(profile);
    logger.info({ profile: profileId }, 'Profile seeded from JSON to DB');
  }

  if (profile.vector) {
    profileVector = searchEngine.deserializeVector(profile.vector);
  } else {
    const keywords = (profile.keywords || []).join('. ');
    profileVector = await searchEngine.generateEmbedding(keywords);
    db.saveProfile({
      ...profile,
      vector: searchEngine.serializeVector(profileVector)
    });
  }

  logger.info(
    { profile: profileId, keywords: (profile.keywords || []).length },
    'Profile vector loaded from DB',
  );

  return profileVector;
}

/**
 * Run a single fetch-filter-dispatch-save cycle.
 */
async function runCycle() {
  if (isRunning) {
    logger.warn('Cycle already running, skipping');
    return { skipped: true };
  }

  isRunning = true;
  const startTime = Date.now();

  logger.info('═══ CYCLE START ═══');

  try {
    // 0. LOAD profile vector (embeddings from your keywords)
    if (!profileVector) {
      await loadProfile();
    }

    // 1. FETCH from all sources
    logger.info('Step 1: Fetching from sources...');
    const rawItems = await sources.fetchAll();
    logger.info({ count: rawItems.length }, 'Fetched items from sources');

    if (rawItems.length === 0) {
      logger.info('No items fetched, ending cycle');
      return { fetched: 0, validated: 0, filtered: 0, saved: 0, chunked: 0 };
    }

    // 2. VALIDATE
    logger.info('Step 2: Validating items...');
    const validItems = validateIRBatch(rawItems, logger);
    logger.info({ valid: validItems.length, dropped: rawItems.length - validItems.length }, 'Validation complete');

    // 3. FILTER by semantic similarity (local embeddings, NO AI calls)
    logger.info('Step 3: Filtering by semantic relevance...');
    const relevant = await searchEngine.findRelevant(validItems, profileVector, config.similarityThreshold);
    logger.info({ relevant: relevant.length, filtered: validItems.length - relevant.length, threshold: config.similarityThreshold }, 'Semantic filter complete');

    // 4. SAVE only relevant items to database
    logger.info('Step 4: Saving relevant items to database (collection: internet)...');
    for (const item of relevant) {
      item.collectionId = 'internet';
    }
    const saved = db.insertItemsBatch(relevant);
    logger.info({ saved, duplicatesSkipped: relevant.length - saved }, 'Save complete');

    // 5. CHUNK AND EMBED
    logger.info('Step 5: Chunking and embedding relevant items...');
    const chunkingConfig = db.getChunkingConfig();
    let totalChunks = 0;
    
    for (const item of relevant) {
      const chunks = await chunker.chunk(item.content, chunkingConfig.strategy, {
        chunkSize: chunkingConfig.chunk_size,
        overlap: chunkingConfig.overlap
      });
      
      const chunksToSave = [];
      for (const c of chunks) {
        const vector = await searchEngine.generateEmbedding(c.content);
        chunksToSave.push({
          id: `${item.id}_${c.chunkIndex}`,
          parentId: item.id,
          content: c.content,
          chunkIndex: c.chunkIndex,
          level: c.level || 'section',
          strategy: chunkingConfig.strategy,
          vector: searchEngine.serializeVector(vector),
          metadata: c.metadata || {}
        });
      }
      
      if (chunksToSave.length > 0) {
        db.insertChunksBatch(chunksToSave);
        totalChunks += chunksToSave.length;
      }
    }
    
    logger.info({ totalChunks, itemsProcessed: relevant.length }, 'Chunking and embedding complete');

    const duration = Date.now() - startTime;
    logger.info(
      { fetched: rawItems.length, validated: validItems.length, relevant: relevant.length, saved, chunked: totalChunks, duration: `${duration}ms` },
      '--- CYCLE END ═══',
    );

    return { fetched: rawItems.length, validated: validItems.length, filtered: relevant.length, saved, chunked: totalChunks, duration };
  } catch (err) {
    /* istanbul ignore next */
    logger.error({ err }, 'Cycle failed');
    /* istanbul ignore next */
    throw err;
  } finally {
    isRunning = false;
  }
}

/**
 * Start the scheduler.
 */
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

/**
 * Stop the scheduler.
 */
/* istanbul ignore next */
function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

function getStatus() {
  return { status: scheduledTask ? 'ok' : 'stopped' };
}

module.exports = {
  runCycle,
  loadProfile,
  start,
  stop,
  getStatus,
};
