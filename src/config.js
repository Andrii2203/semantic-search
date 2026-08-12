'use strict';

const path = require('path');

// Load .env BEFORE accessing process.env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Reads an env variable. Throws if required and missing.
 */
/* istanbul ignore next */
function env(key, fallback) {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(
    `[CONFIG] Missing required environment variable: ${key}. ` +
      `Check your .env file or set it in the environment. See .env.example for reference.`,
  );
}

/* istanbul ignore next */
function envInt(key, fallback) {
  const raw = env(key, fallback !== undefined ? String(fallback) : undefined);
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`[CONFIG] Environment variable ${key} must be a valid integer, got: "${raw}"`);
  }
  return parsed;
}

/* istanbul ignore next */
function envFloat(key, fallback) {
  const raw = env(key, fallback !== undefined ? String(fallback) : undefined);
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`[CONFIG] Environment variable ${key} must be a valid number, got: "${raw}"`);
  }
  return parsed;
}

const config = Object.freeze({
  // Server
  port: envInt('PORT', 3000),
  nodeEnv: env('NODE_ENV', 'development'),
  get isProduction() {
    return this.nodeEnv === 'production';
  },

  // Database
  dbPath: path.resolve(env('DB_PATH', './data/app.db')),

  // Groq LLM
  groq: Object.freeze({
    apiKey: env('GROQ_API_KEY', ''),
    model: env('GROQ_MODEL', 'llama-3.1-70b-versatile'),
    maxTokens: envInt('GROQ_MAX_TOKENS', 512),
    rateLimit: envInt('GROQ_RATE_LIMIT', 10),
  }),

  // Reddit
  reddit: Object.freeze({
    subreddits: env('REDDIT_SUBREDDITS', 'programming,technology,webdev').split(',').map((s) => s.trim()),
    limit: envInt('REDDIT_LIMIT', 50),
  }),

  // Djinni
  djinni: Object.freeze({
    keywords: env('DJINNI_KEYWORDS', 'AI').split(',').map(s => s.trim()),
    limit: envInt('DJINNI_LIMIT', 130),
  }),

    

  // Profiles
  activeProfile: env('ACTIVE_PROFILE', 'content'),
  profiles: Object.freeze({
    content: path.resolve(__dirname, 'profiles', 'content.json'),
    job_hunter: path.resolve(__dirname, 'profiles', 'job_hunter.json'),
  }),

  // Search
  similarityThreshold: envFloat('SIMILARITY_THRESHOLD', 0.35),

  // Semantic near-dedup at ingest (v7.1): skip chunks almost identical to recent
  // corpus chunks (same story from HN and Reddit is embedded once)
  dedupThreshold: envFloat('DEDUP_THRESHOLD', 0.95),
  dedupWindow: envInt('DEDUP_WINDOW', 200),

  // File uploads (per request; the library itself grows unbounded across uploads).
  // Not unlimited — memoryStorage holds every file in RAM, so a huge single
  // request would blow memory / time out. Large batches → upload in chunks.
  upload: Object.freeze({
    maxFiles: envInt('UPLOAD_MAX_FILES', 200),
    maxFileSizeMb: envInt('UPLOAD_MAX_FILE_MB', 10),
  }),

  // Scheduler
  cronSchedule: env('CRON_SCHEDULE', '*/30 * * * *'),

  // Rate limiting (API)
  apiRateLimit: envInt('API_RATE_LIMIT', 60),

  // CORS
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:3000'),

  // Auth — Internet Mode lock
  internetModePassword: env('INTERNET_MODE_PASSWORD', ''),
  sessionSecret: env('SESSION_SECRET', 'change-me-in-production'),

  // Logging
  logLevel: env('LOG_LEVEL', 'info'),

  // Chunking
  chunking: Object.freeze({
    defaultStrategy: env('CHUNKING_STRATEGY', 'semantic'),
    chunkSize: envInt('CHUNK_SIZE', 200),
    overlap: envInt('CHUNK_OVERLAP', 50),
  }),

  // Search
  search: Object.freeze({
    defaultMode: env('SEARCH_MODE', 'sequential'),
    bm25Weight: envFloat('BM25_WEIGHT', 0.4),
    semanticWeight: envFloat('SEMANTIC_WEIGHT', 0.6),
    batchSize: envInt('EMBEDDING_BATCH_SIZE', 20),
    maxBm25Results: envInt('MAX_BM25_RESULTS', 100),
    // Phase 2.5 ranking — both free, always-on by default.
    // Rollback switches: USE_RRF=false → weighted sum; MMR_LAMBDA=1.0 → no diversity.
    useRrf: env('USE_RRF', 'true') !== 'false',
    rrfK: envInt('RRF_K', 60),
    mmrLambda: envFloat('MMR_LAMBDA', 0.5),
  }),

  // Phase 3: live settings resolver. A value set via the settings table
  // overrides the .env/default below. `db` is lazy-required to avoid the
  // db <-> config require cycle, and a missing/uninitialized DB falls back.
  live(key) {
    const defaults = {
      searchThreshold:          this.similarityThreshold,
      searchMode:               this.search.defaultMode,
      bm25Weight:               this.search.bm25Weight,
      semanticWeight:           this.search.semanticWeight,
      topN:                     20,
      cronEnabled:              true,
      cronSchedule:             this.cronSchedule,
      groqModel:                this.groq.model,
      chunkingStrategy:         this.chunking.defaultStrategy,
      useHyde:                  false,
      groqApiKey:               this.groq.apiKey,
    };
    let stored;
    try {
      stored = require('./db').getSetting(key);
    } catch {
      stored = undefined;
    }
    return stored === undefined ? defaults[key] : stored;
  },
});

module.exports = config;
