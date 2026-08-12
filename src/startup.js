'use strict';

const db = require('./db');
const searchEngine = require('./search-engine');
const config = require('./config');
const logger = require('./logger');

async function checkDatabase() {
  try {
    const database = db.getDb();
    database.prepare('SELECT 1').get();
    return { ok: true, status: 'ok' };
  } catch (err) {
    return { ok: false, status: 'error', error: err.message };
  }
}

async function checkEmbeddingModel() {
  try {
    const vector = await searchEngine.generateEmbedding('test connection');
    if (!vector || vector.length !== 384) {
      return { ok: false, status: 'error', error: `Invalid vector dimensions: ${vector ? vector.length : 0}` };
    }
    return { ok: true, status: 'ok' };
  } catch (err) {
    return { ok: false, status: 'error', error: err.message };
  }
}

async function checkGroqAPI() {
  if (!config.groq || !config.groq.apiKey) {
    return { ok: false, status: 'warning', error: 'Missing GROQ_API_KEY' };
  }
  return { ok: true, status: 'ok' };
}

async function checkFTS5() {
  try {
    const database = db.getDb();
    database.prepare('SELECT count(*) FROM chunks_fts LIMIT 1').get();
    return { ok: true, status: 'ok' };
  } catch (err) {
    return { ok: false, status: 'error', error: err.message };
  }
}

async function checkSessionSecret() {
  if (config.isProduction && config.sessionSecret === config.defaultSessionSecret) {
    return {
      ok: false,
      status: 'error',
      error: 'SESSION_SECRET is still the published default value',
    };
  }
  return { ok: true, status: 'ok' };
}

let lastStatus = {
  status: 'unknown',
  modules: { db: 'unknown', embedding: 'unknown', groq: 'unknown', fts5: 'unknown' }
};

function getLastStatus() {
  return lastStatus;
}

async function runStartupChecks() {
  logger.info('Running startup diagnostics...');
  
  let isDegraded = false;

  const secretCheck = await checkSessionSecret();
  if (!secretCheck.ok) {
    logger.fatal({ error: secretCheck.error }, 'Startup check failed: session secret is not configured. System cannot start.');
    throw new Error(`Session secret check failed: ${secretCheck.error}`);
  }

  const dbCheck = await checkDatabase();
  if (!dbCheck.ok) {
    logger.fatal({ error: dbCheck.error }, 'Startup check failed: Database connection failed. System cannot start.');
    throw new Error(`Database check failed: ${dbCheck.error}`);
  }

  const embeddingCheck = await checkEmbeddingModel();
  if (!embeddingCheck.ok) {
    logger.warn({ error: embeddingCheck.error }, 'Startup check warning: Embedding model failed to load. Starting in degraded mode (no semantic search).');
    isDegraded = true;
  }
  
  const groqCheck = await checkGroqAPI();
  if (!groqCheck.ok) {
    logger.warn({ error: groqCheck.error }, 'Startup check warning: Groq API key is missing or invalid. Starting in degraded mode (no AI features).');
    isDegraded = true;
  }

  const fts5Check = await checkFTS5();
  if (!fts5Check.ok) {
    logger.warn({ error: fts5Check.error }, 'Startup check warning: FTS5 not available. Starting in degraded mode (no full-text search).');
    isDegraded = true;
  }

  logger.info({
    database: dbCheck.status,
    embedding: embeddingCheck.status,
    groq: groqCheck.status,
    fts5: fts5Check.status,
    overall: isDegraded ? 'degraded' : 'healthy'
  }, 'Startup diagnostics complete');

  lastStatus = {
    status: isDegraded ? 'degraded' : 'healthy',
    modules: {
      db: dbCheck.status,
      embedding: embeddingCheck.status,
      groq: groqCheck.status,
      fts5: fts5Check.status
    }
  };
  
  return lastStatus;
}

module.exports = {
  checkDatabase,
  checkEmbeddingModel,
  checkGroqAPI,
  checkFTS5,
  checkSessionSecret,
  runStartupChecks,
  getLastStatus
};
