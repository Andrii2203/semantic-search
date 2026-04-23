'use strict';

const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const sources = require('./sources/index');
const searchEngine = require('./search-engine');
const { validateIRBatch } = require('./validation');
const fs = require('fs');

let profileVector = null;
let isRunning = false;
let scheduledTask = null;

/**
 * Load and cache the active profile vector.
 */
async function loadProfile() {
  const profilePath = config.profiles[config.activeProfile];
  if (!profilePath || !fs.existsSync(profilePath)) {
    /* istanbul ignore next */
    throw new Error(`Profile not found: ${config.activeProfile} at ${profilePath}`);
  }

  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
  const keywords = profile.keywords.join('. ');
  profileVector = await searchEngine.generateEmbedding(keywords);

  logger.info(
    { profile: config.activeProfile, keywords: profile.keywords.length },
    'Profile vector loaded',
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
      return { fetched: 0, validated: 0, filtered: 0, saved: 0 };
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
    logger.info('Step 4: Saving relevant items to database...');
    const saved = db.insertItemsBatch(relevant);
    logger.info({ saved, duplicatesSkipped: relevant.length - saved }, 'Save complete');

    const duration = Date.now() - startTime;
    logger.info(
      { fetched: rawItems.length, validated: validItems.length, relevant: relevant.length, saved, duration: `${duration}ms` },
      '--- CYCLE END ═══',
    );

    return { fetched: rawItems.length, validated: validItems.length, filtered: relevant.length, saved, duration };
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

module.exports = {
  runCycle,
  loadProfile,
  start,
  stop,
};
