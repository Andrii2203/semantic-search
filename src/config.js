'use strict';

const path = require('path');
const os = require('os');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_SESSION_SECRET = 'change-me-in-production';

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
  port: envInt('PORT', 3000),
  nodeEnv: env('NODE_ENV', 'development'),
  get isProduction() {
    return this.nodeEnv === 'production';
  },

  dbPath: path.resolve(env('DB_PATH', './data/app.db')),
  exportPath: path.resolve(env('EXPORT_PATH', './data/export.json')),

  groq: Object.freeze({
    apiKey: env('GROQ_API_KEY', ''),
    model: env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
    maxTokens: envInt('GROQ_MAX_TOKENS', 512),
    rateLimit: envInt('GROQ_RATE_LIMIT', 10),
  }),

  reddit: Object.freeze({
    subreddits: env('REDDIT_SUBREDDITS', 'programming,technology,webdev').split(',').map((s) => s.trim()),
    limit: envInt('REDDIT_LIMIT', 50),
  }),

  djinni: Object.freeze({
    keywords: env('DJINNI_KEYWORDS', 'AI').split(',').map(s => s.trim()),
    limit: envInt('DJINNI_LIMIT', 130),
  }),

    

  activeProfile: env('ACTIVE_PROFILE', 'content'),
  profiles: Object.freeze({
    content: path.resolve(__dirname, 'profiles', 'content.json'),
    job_hunter: path.resolve(__dirname, 'profiles', 'job_hunter.json'),
  }),

  similarityThreshold: envFloat('SIMILARITY_THRESHOLD', 0.35),

  dedupThreshold: envFloat('DEDUP_THRESHOLD', 0.95),
  dedupWindow: envInt('DEDUP_WINDOW', 200),

  upload: Object.freeze({
    maxFiles: envInt('UPLOAD_MAX_FILES', 200),
    maxFileSizeMb: envInt('UPLOAD_MAX_FILE_MB', 10),
    tempDir: path.resolve(env('UPLOAD_TEMP_DIR', path.join(os.tmpdir(), 'semantic-search-uploads'))),
  }),

  sourceTimeoutMs: envInt('SOURCE_TIMEOUT_MS', 10000),

  cronSchedule: env('CRON_SCHEDULE', '*/30 * * * *'),

  apiRateLimit: envInt('API_RATE_LIMIT', 60),

  corsOrigin: env('CORS_ORIGIN', 'http://localhost:3000'),

  internetModePassword: env('INTERNET_MODE_PASSWORD', ''),
  sessionSecret: env('SESSION_SECRET', DEFAULT_SESSION_SECRET),
  defaultSessionSecret: DEFAULT_SESSION_SECRET,

  logLevel: env('LOG_LEVEL', 'info'),

  chunking: Object.freeze({
    defaultStrategy: env('CHUNKING_STRATEGY', 'semantic'),
    chunkSize: envInt('CHUNK_SIZE', 200),
    overlap: envInt('CHUNK_OVERLAP', 50),
  }),

  search: Object.freeze({
    defaultMode: env('SEARCH_MODE', 'sequential'),
    bm25Weight: envFloat('BM25_WEIGHT', 0.4),
    semanticWeight: envFloat('SEMANTIC_WEIGHT', 0.6),
    batchSize: envInt('EMBEDDING_BATCH_SIZE', 20),
    maxBm25Results: envInt('MAX_BM25_RESULTS', 100),
    useRrf: env('USE_RRF', 'true') !== 'false',
    rrfK: envInt('RRF_K', 60),
    mmrLambda: envFloat('MMR_LAMBDA', 0.5),
  }),

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
