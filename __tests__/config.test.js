'use strict';

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('../src/config');
const constants = require('../src/search-constants');

function readEnvExample() {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .reduce((acc, line) => {
      const index = line.indexOf('=');
      acc[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      return acc;
    }, {});
}

describe('src/config.js', () => {
  test('exposes the values the server needs to boot', () => {
    expect(config.port).toBeDefined();
    expect(config.similarityThreshold).toBeDefined();
    expect(config.dbPath).toBeDefined();
    expect(config.sessionSecret).toBeDefined();
  });

  test('parses numeric settings as numbers', () => {
    expect(typeof config.port).toBe('number');
    expect(typeof config.similarityThreshold).toBe('number');
    expect(typeof config.sourceTimeoutMs).toBe('number');
  });

  test('gives every outbound source request a timeout', () => {
    expect(config.sourceTimeoutMs).toBeGreaterThan(0);
  });

  test('points uploads at a temp directory on disk', () => {
    expect(typeof config.upload.tempDir).toBe('string');
    expect(config.upload.tempDir.length).toBeGreaterThan(0);
  });

  test('every retrieval default is the value search-constants exports for the same concept', () => {
    expect(config.similarityThreshold).toBe(constants.semanticCutoffInbox);
    expect(config.dedupThreshold).toBe(constants.dedupCosine);
    expect(config.dedupWindow).toBe(constants.dedupWindow);
    expect(config.chunking.chunkSize).toBe(constants.chunkSizeWords);
    expect(config.chunking.overlap).toBe(constants.chunkOverlapWords);
    expect(config.search.bm25Weight).toBe(constants.bm25Weight);
    expect(config.search.semanticWeight).toBe(constants.semanticWeight);
    expect(config.search.maxBm25Results).toBe(constants.candidateLimitBm25);
    expect(config.search.rrfK).toBe(constants.rrfK);
    expect(config.search.mmrLambda).toBe(constants.mmrLambda);
    expect(config.live('topN')).toBe(constants.resultsReturned);
  });

  test('no retrieval default in the module is written as a literal', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf-8');
    const retrieval = source
      .split('\n')
      .filter((line) => /SIMILARITY_THRESHOLD|DEDUP_|CHUNK_SIZE|CHUNK_OVERLAP|BM25_WEIGHT|SEMANTIC_WEIGHT|MAX_BM25_RESULTS|RRF_K|MMR_LAMBDA/.test(line))
      .filter((line) => /,\s*[\d.]+\s*\)/.test(line));

    expect(retrieval).toEqual([]);
  });
});

describe('.env.example', () => {
  test('carries a cron expression that node-cron accepts', () => {
    const example = readEnvExample();

    expect(cron.validate(example.CRON_SCHEDULE)).toBe(true);
  });

  test('carries a cron expression that fires on a real date', () => {
    const example = readEnvExample();
    const dayOfMonth = example.CRON_SCHEDULE.split(' ')[2];
    const month = example.CRON_SCHEDULE.split(' ')[3];

    expect(`${dayOfMonth} ${month}`).not.toBe('31 2');
  });

  test('documents the session secret so a deployment cannot forget it', () => {
    const example = readEnvExample();

    expect(example.SESSION_SECRET).toBeDefined();
  });
});
