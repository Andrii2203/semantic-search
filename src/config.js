'use strict';

const path = require('path');

// Load .env BEFORE accessing process.env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Reads an env variable. Throws if required and missing.
 */
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

function envInt(key, fallback) {
  const raw = env(key, fallback !== undefined ? String(fallback) : undefined);
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`[CONFIG] Environment variable ${key} must be a valid integer, got: "${raw}"`);
  }
  return parsed;
}

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
  similarityThreshold: envFloat('SIMILARITY_THRESHOLD', 0.65),

  // Scheduler
  cronSchedule: env('CRON_SCHEDULE', '*/30 * * * *'),

  // Rate limiting (API)
  apiRateLimit: envInt('API_RATE_LIMIT', 60),

  // CORS
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:3000'),

  // Logging
  logLevel: env('LOG_LEVEL', 'info'),
});

module.exports = config;
