'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn(),
}));
jest.mock('../../src/profile-generator');
jest.mock('../../src/reranker', () => ({ rerank: jest.fn() }));
jest.mock('../../src/explainer', () => ({ explain: jest.fn() }));
jest.mock('../../src/search-engine');
jest.mock('../../src/hyde', () => ({ hydeExpand: jest.fn() }));
jest.mock('../../src/groq-client', () => ({}));

// Control config.groq.apiKey per test
jest.mock('../../src/config', () => {
  const actual = jest.requireActual('../../src/config');
  return Object.create(actual, {
    groq: { value: { ...actual.groq, apiKey: 'test-key' }, enumerable: true, configurable: true, writable: true },
  });
});

const ProfileGenerator = require('../../src/profile-generator');
const SearchEngine = require('../../src/search-engine');
const { hydeExpand } = require('../../src/hyde');
const config = require('../../src/config');
const db = require('../../src/db');

const MOCK_PROFILE = {
  id: 'p1', keywords: ['rust'], rawInput: 'rust async',
  vector: Buffer.from(new Float32Array(384).fill(0.1).buffer),
};

let app;

beforeAll(() => {
  const searchRouter = require('../../src/routes/search');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = 'u-1'; next(); });
  app.use('/api/search', searchRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ error: { code: err.code, message: err.message } });
  });
});

beforeEach(() => {
  db.init(':memory:');
  db.createUser({ id: 'u-1', email: 'u1@x.com', passwordHash: 'h' });
  jest.clearAllMocks();
  config.groq.apiKey = 'test-key';

  SearchEngine.deserializeVector.mockReturnValue(new Array(384).fill(0.1));
  SearchEngine.generateEmbedding.mockResolvedValue(new Array(384).fill(0.2));
  SearchEngine.scoreChunksByVector.mockReturnValue([]);
  SearchEngine.rrfMerge.mockReturnValue([]);
  SearchEngine.mmrSelect.mockImplementation((docs) => docs);
  SearchEngine.groupByParent.mockReturnValue([]);
  ProfileGenerator.fromText.mockResolvedValue(MOCK_PROFILE);
});

afterEach(() => db.close());

describe('POST /api/search — HyDE', () => {
  it('useHyde:true → calls hydeExpand, embeds the hypothetical doc, response hydeUsed:true', async () => {
    hydeExpand.mockResolvedValue('A hypothetical passage comparing tokio and async-std runtimes.');

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'rust async', useHyde: true })
      .expect(200);

    expect(hydeExpand).toHaveBeenCalledWith('rust async');
    expect(SearchEngine.generateEmbedding).toHaveBeenCalledWith(
      'A hypothetical passage comparing tokio and async-std runtimes.',
    );
    expect(res.body.hydeUsed).toBe(true);
    expect(res.body.hypotheticalDoc).toMatch(/tokio/);
    expect(res.body.stats.hydeUsed).toBe(true);
  });

  it('useHyde:false (default) → hydeExpand not called, hydeUsed:false', async () => {
    const res = await request(app)
      .post('/api/search')
      .send({ query: 'rust async' })
      .expect(200);

    expect(hydeExpand).not.toHaveBeenCalled();
    expect(res.body.hydeUsed).toBe(false);
    expect(res.body.hypotheticalDoc).toBeNull();
  });

  it('useHyde:true without Groq key → 400 with clear message', async () => {
    config.groq.apiKey = '';

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'rust async', useHyde: true })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.message).toMatch(/Groq API key/i);
    expect(hydeExpand).not.toHaveBeenCalled();
  });

  it('HyDE generation failing (null) → falls back to query vector, hydeUsed:false', async () => {
    hydeExpand.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'rust async', useHyde: true })
      .expect(200);

    expect(hydeExpand).toHaveBeenCalled();
    // Hypothetical doc failed → we did NOT embed a hypothetical doc
    expect(SearchEngine.generateEmbedding).not.toHaveBeenCalled();
    expect(res.body.hydeUsed).toBe(false);
  });
});

describe('hydeExpand — module unit', () => {
  const { hydeExpand: realHyde } = jest.requireActual('../../src/hyde');

  it('returns trimmed hypothetical doc from the groq client', async () => {
    const fakeGroq = { chat: jest.fn().mockResolvedValue('  Generated ideal document.  ') };
    const doc = await realHyde('some query', fakeGroq);
    expect(doc).toBe('Generated ideal document.');
    expect(fakeGroq.chat).toHaveBeenCalled();
  });

  it('returns null for empty query (no API call)', async () => {
    const fakeGroq = { chat: jest.fn() };
    expect(await realHyde('   ', fakeGroq)).toBeNull();
    expect(fakeGroq.chat).not.toHaveBeenCalled();
  });

  it('returns null when groq throws (graceful fallback)', async () => {
    const fakeGroq = { chat: jest.fn().mockRejectedValue(new Error('rate limit')) };
    expect(await realHyde('query', fakeGroq)).toBeNull();
  });

  it('returns null when groq returns empty string', async () => {
    const fakeGroq = { chat: jest.fn().mockResolvedValue('   ') };
    expect(await realHyde('query', fakeGroq)).toBeNull();
  });
});
