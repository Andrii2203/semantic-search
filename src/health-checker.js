'use strict';

const startup = require('./startup');
const scheduler = require('./scheduler');
const config = require('./config');

const TTL_MS = 30_000;
let cache = null;
let cachedAt = 0;

async function compute() {
  const db = await startup.checkDatabase();
  const fts5 = await startup.checkFTS5();

  const groqKey = config.live('groqApiKey');
  const groq = groqKey
    ? { ok: true, status: 'ok' }
    : { ok: false, status: 'warning', error: 'Groq API key not configured' };

  const embeddingStatus = startup.getLastStatus().modules.embedding || 'unknown';
  const embedding = { status: embeddingStatus };

  const sched = scheduler.getStatus();
  const schedulerModule = {
    status: sched.status,
    isRunning: sched.isRunning,
    currentStep: sched.currentStep,
    lastResult: sched.lastResult,
  };

  const modules = { db, fts5, groq, embedding, scheduler: schedulerModule };
  const states = [db.status, fts5.status, groq.status, embeddingStatus, sched.status];
  const overall = states.includes('error')
    ? 'critical'
    : states.includes('warning')
      ? 'degraded'
      : 'healthy';

  return { status: overall, modules, checkedAt: new Date().toISOString() };
}

async function getHealth({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache && now - cachedAt < TTL_MS) {
    return { ...cache, cached: true };
  }
  cache = await compute();
  cachedAt = now;
  return { ...cache, cached: false };
}

function clearCache() {
  cache = null;
  cachedAt = 0;
}

module.exports = { getHealth, clearCache, TTL_MS };
