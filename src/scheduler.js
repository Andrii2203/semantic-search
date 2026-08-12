'use strict';

const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const sources = require('./sources/index');
const rss = require('./sources/rss');
const searchEngine = require('./search-engine');
const { validateIRBatch } = require('./validation');
const fs = require('fs');
const events = require('./events');

const chunker = require('./chunker/index');

const profileVectors = new Map();
let isRunning = false;
let scheduledTask = null;
let activeSchedule = null;
let currentStep = null;
let cycleStartedAt = null;
let lastResult = null;

function readDefaultProfileFile() {
  const profilePath = config.profiles?.[config.activeProfile];
  if (!profilePath || !fs.existsSync(profilePath)) {
    return { keywords: [], rawInput: '' };
  }

  const file = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
  return {
    keywords: file.keywords || [],
    rawInput: file.rawInput || file.keywords?.join('. ') || '',
  };
}

function createDefaultProfile(userId) {
  const defaults = readDefaultProfileFile();
  const profile = {
    id: `user-${userId}`,
    userId,
    keywords: defaults.keywords,
    rawInput: defaults.rawInput,
    vector: null,
  };

  db.saveProfileForUser(userId, profile);
  logger.info({ userId }, 'Profile created from defaults for new user');
  return profile;
}

async function resolveProfileVector(userId, profile) {
  if (profile.vector) {
    return searchEngine.deserializeVector(profile.vector);
  }

  const keywords = (profile.keywords || []).join('. ') || 'technology software';
  const vector = await searchEngine.generateEmbedding(keywords);
  db.saveProfileForUser(userId, { ...profile, vector: searchEngine.serializeVector(vector) });
  return vector;
}

async function loadProfileForUser(userId) {
  if (profileVectors.has(userId)) {
    return profileVectors.get(userId);
  }

  const profile = db.getProfileByUserId(userId) || createDefaultProfile(userId);
  const vector = await resolveProfileVector(userId, profile);

  profileVectors.set(userId, vector);
  logger.info({ userId, keywords: (profile.keywords || []).length }, 'Profile vector loaded');
  return vector;
}

function invalidateProfileCache(userId) {
  profileVectors.delete(userId);
}

function passesPreFilter(item) {
  const content = (item.content || '').trim();
  const title = (item.metadata?.title || '').trim();
  if (content.length < 50) {
    return false;
  }
  return !(title && title === content);
}

function saveToCorpus(items) {
  const newItems = [];
  for (const item of items) {
    const corpusItem = { ...item, collectionId: 'internet' };
    if (db.insertItem(corpusItem)) {
      newItems.push(corpusItem);
    }
  }
  logger.info(
    { saved: newItems.length, duplicatesSkipped: items.length - newItems.length },
    'Corpus save complete',
  );
  return newItems;
}

async function buildChunksForItem(item, chunkingConfig, recentVectors) {
  const chunks = await chunker.chunk(item.content, chunkingConfig.strategy, {
    chunkSize: chunkingConfig.chunk_size,
    overlap: chunkingConfig.overlap,
  });

  const chunksToSave = [];
  let nearDuplicates = 0;

  for (const piece of chunks) {
    const vector = await searchEngine.generateEmbedding(piece.content);
    const isNearDuplicate = recentVectors.some(
      (known) => searchEngine.cosineSimilarity(known, vector) > config.dedupThreshold,
    );

    if (isNearDuplicate) {
      nearDuplicates++;
      logger.info({ itemId: item.id, chunkIndex: piece.chunkIndex }, 'Near-duplicate chunk skipped');
      continue;
    }

    recentVectors.push(vector);
    chunksToSave.push({
      id: `${item.id}_${piece.chunkIndex}`,
      parentId: item.id,
      content: piece.content,
      chunkIndex: piece.chunkIndex,
      level: piece.level || 'section',
      strategy: chunkingConfig.strategy,
      vector: searchEngine.serializeVector(vector),
      metadata: piece.metadata || {},
    });
  }

  return { chunksToSave, nearDuplicates };
}

async function indexNewItems(newItems) {
  const chunkingConfig = db.getChunkingConfig();
  const recentVectors = db
    .getRecentInternetChunkVectors(config.dedupWindow)
    .map((blob) => searchEngine.deserializeVector(blob));

  const itemVectors = new Map();
  let totalChunked = 0;
  let nearDuplicates = 0;

  for (const item of newItems) {
    itemVectors.set(item.id, await searchEngine.generateEmbedding(item.content));

    const result = await buildChunksForItem(item, chunkingConfig, recentVectors);
    nearDuplicates += result.nearDuplicates;

    if (result.chunksToSave.length > 0) {
      db.insertChunksBatch(result.chunksToSave);
      totalChunked += result.chunksToSave.length;
    }
  }

  logger.info({ chunked: totalChunked, nearDuplicates }, 'Indexing complete');
  return { itemVectors, totalChunked };
}

function sourceKeyOfItem(item) {
  return item.source === 'rss' ? `rss:${item.metadata?.feedUrl}` : item.source;
}

function sourceKeyOfRow(row) {
  return row.type === 'rss' ? `rss:${row.url}` : row.url;
}

async function fetchFromSource(row) {
  return row.type === 'rss' ? rss.fetchFeed(row.url) : sources.fetchOne(row.url);
}

async function fetchFromUserSources() {
  const enabled = db.getEnabledSources();
  if (enabled.length === 0) {
    return sources.fetchAll();
  }

  const distinct = new Map();
  for (const row of enabled) {
    distinct.set(sourceKeyOfRow(row), row);
  }

  const items = [];
  for (const [key, row] of distinct) {
    try {
      items.push(...(await fetchFromSource(row)));
    } catch (err) {
      logger.warn({ err, source: key }, 'Source failed, the cycle continues');
    }
  }

  return items;
}

function allowedSourceKeys(userId) {
  const rows = db.getUserSources(userId);
  if (rows.length === 0) {
    return null;
  }
  return new Set(rows.filter((row) => row.enabled).map(sourceKeyOfRow));
}

async function matchUsers(users, newItems, itemVectors) {
  const matchThreshold = config.live('searchThreshold');
  let totalMatches = 0;

  for (const user of users) {
    currentStep = `Matching items for ${user.email}...`;
    const userVector = await loadProfileForUser(user.id);
    const allowed = allowedSourceKeys(user.id);
    let matched = 0;

    for (const item of newItems) {
      if (allowed && !allowed.has(sourceKeyOfItem(item))) {
        continue;
      }
      const score = searchEngine.cosineSimilarity(itemVectors.get(item.id), userVector);
      if (score >= matchThreshold) {
        db.upsertUserMatch({ userId: user.id, itemId: item.id, score, status: 'new' });
        matched++;
      }
    }

    totalMatches += matched;
    logger.info({ userId: user.id, matched, threshold: matchThreshold }, 'User matching complete');
  }

  return totalMatches;
}

function emptyCycleResult(fetched, validated, preFilteredCount, startTime) {
  const duration = Date.now() - startTime;
  lastResult = { fetched, saved: 0, chunked: 0, matches: 0, duration };
  currentStep = null;
  return {
    fetched,
    validated,
    preFiltered: preFilteredCount,
    filtered: 0,
    saved: 0,
    chunked: 0,
    matches: 0,
    duration,
  };
}

function selectIngestableItems(rawItems) {
  currentStep = `Validating ${rawItems.length} items...`;
  const validItems = validateIRBatch(rawItems, logger);
  logger.info(
    { valid: validItems.length, dropped: rawItems.length - validItems.length },
    'Validation complete',
  );

  const preFiltered = validItems.filter(passesPreFilter);
  const preFilteredCount = validItems.length - preFiltered.length;
  logger.info({ passed: preFiltered.length, skipped: preFilteredCount }, 'Pre-filter complete');

  return { validItems, preFiltered, preFilteredCount };
}

function finishCycle(result) {
  logger.info(result, 'CYCLE END');
  lastResult = result;
  currentStep = null;
  events.emit('sync.completed', result);
  return result;
}

async function ingest(startTime) {
  currentStep = 'Fetching from sources...';
  const rawItems = await fetchFromUserSources();
  logger.info({ count: rawItems.length }, 'Fetched items from sources');

  if (rawItems.length === 0) {
    return emptyCycleResult(0, 0, 0, startTime);
  }

  const { validItems, preFiltered, preFilteredCount } = selectIngestableItems(rawItems);

  currentStep = 'Saving new items to corpus...';
  const newItems = saveToCorpus(preFiltered);

  if (newItems.length === 0) {
    return emptyCycleResult(rawItems.length, validItems.length, preFilteredCount, startTime);
  }

  currentStep = `Building search index for ${newItems.length} new items...`;
  const { itemVectors, totalChunked } = await indexNewItems(newItems);
  const totalMatches = await matchUsers(db.getAllUsers(), newItems, itemVectors);

  return finishCycle({
    fetched: rawItems.length,
    validated: validItems.length,
    preFiltered: preFilteredCount,
    saved: newItems.length,
    chunked: totalChunked,
    matches: totalMatches,
    duration: Date.now() - startTime,
  });
}

async function runCycle() {
  if (isRunning) {
    logger.warn('Cycle already running, skipping');
    return { skipped: true };
  }

  isRunning = true;
  cycleStartedAt = Date.now();
  const startTime = cycleStartedAt;
  logger.info('CYCLE START');

  try {
    return await ingest(startTime);
  } catch (err) {
    logger.error({ err }, 'Cycle failed');
    currentStep = null;
    throw err;
  } finally {
    isRunning = false;
    cycleStartedAt = null;
  }
}

function stopSchedule() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    activeSchedule = null;
  }
}

function applySchedule() {
  stopSchedule();

  if (config.live('cronEnabled') === false) {
    logger.info('Scheduler is switched off in settings, no cycle is scheduled');
    return null;
  }

  const schedule = config.live('cronSchedule');
  if (!cron.validate(schedule)) {
    logger.warn({ schedule }, 'Cron expression is not valid, no cycle is scheduled');
    return null;
  }

  scheduledTask = cron.schedule(schedule, async () => {
    try {
      await runCycle();
    } catch (err) {
      logger.error({ err }, 'Scheduled cycle failed');
    }
  });
  activeSchedule = schedule;

  logger.info({ schedule }, 'Scheduler started');
  return scheduledTask;
}

function start() {
  logger.info({ profile: config.activeProfile }, 'Scheduler starting');
  return applySchedule();
}

function stop() {
  stopSchedule();
  logger.info('Scheduler stopped');
}

function getStatus() {
  return {
    status: scheduledTask ? 'ok' : 'stopped',
    schedule: activeSchedule,
    isRunning,
    currentStep,
    cycleStartedAt,
    lastResult,
  };
}

function isCycleRunning() {
  return isRunning;
}

module.exports = {
  runCycle,
  applySchedule,
  invalidateProfileCache,
  start,
  stop,
  getStatus,
  isRunning: isCycleRunning,
};
