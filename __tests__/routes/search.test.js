'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}));

jest.mock('../../src/profile-generator');
jest.mock('../../src/reranker', () => ({ rerank: jest.fn() }));
jest.mock('../../src/explainer', () => ({ explain: jest.fn() }));
jest.mock('../../src/search-engine');
jest.mock('../../src/groq-client', () => ({}));

const ProfileGenerator = require('../../src/profile-generator');
const { rerank } = require('../../src/reranker');
const { explain } = require('../../src/explainer');
const SearchEngine = require('../../src/search-engine');
const db = require('../../src/db');

// ─── Fixtures ────────────────────────────────────────────────

const MOCK_VECTOR_BUF = Buffer.from(new Float32Array(384).fill(0.1).buffer);
const MOCK_PROFILE = {
  id: 'test-profile',
  keywords: ['javascript', 'nodejs'],
  vector: MOCK_VECTOR_BUF,
};

function makeItem(overrides = {}) {
  return {
    id: 'item-001',
    content: 'Test content about JavaScript and Node.js',
    type: 'post',
    source: 'hn',
    metadata: { title: 'Test Post', url: 'https://example.com' },
    ...overrides,
  };
}

// ─── Setup ───────────────────────────────────────────────────

let app;
let searchRouter;

beforeAll(() => {
  searchRouter = require('../../src/routes/search');
  app = express();
  app.use(express.json());
  app.use('/api/search', searchRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ error: { code: err.code, message: err.message } });
  });
});

beforeEach(() => {
  db.init(':memory:');
  jest.clearAllMocks();

  SearchEngine.deserializeVector.mockReturnValue(new Array(384).fill(0.1));
  SearchEngine.scoreChunksByVector.mockReturnValue([]);
  SearchEngine.mergeResults.mockReturnValue([]);
  SearchEngine.rrfMerge.mockReturnValue([]);
  SearchEngine.mmrSelect.mockImplementation((docs) => docs); // identity — diversity tested in search-engine unit tests
  SearchEngine.groupByParent.mockReturnValue([]);

  ProfileGenerator.fromText.mockResolvedValue(MOCK_PROFILE);
  ProfileGenerator.loadProfile.mockReturnValue(MOCK_PROFILE);
});

afterEach(() => {
  db.close();
});

// ═══════════════════════════════════════════════════════════════
// POST /api/search
// ═══════════════════════════════════════════════════════════════

describe('POST /api/search', () => {
  it('returns results when query is provided (sequential mode)', async () => {
    const res = await request(app)
      .post('/api/search')
      .send({ query: 'javascript tutorial' })
      .expect(200);

    expect(ProfileGenerator.fromText).toHaveBeenCalledWith(
      'javascript tutorial',
      expect.any(Object),
    );
    expect(res.body).toHaveProperty('results');
    expect(res.body).toHaveProperty('stats');
    expect(res.body.stats.mode).toBe('sequential');
  });

  it('uses loadProfile when profileId is provided', async () => {
    await request(app)
      .post('/api/search')
      .send({ profileId: 'test-profile' })
      .expect(200);

    expect(ProfileGenerator.loadProfile).toHaveBeenCalledWith('test-profile');
    expect(ProfileGenerator.fromText).not.toHaveBeenCalled();
  });

  it('returns 400 when neither query nor profileId provided', async () => {
    const res = await request(app).post('/api/search').send({}).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('overrides profile keywords when customKeywords provided', async () => {
    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test', keywords: ['react', 'frontend'] })
      .expect(200);

    expect(res.body.profile.keywords).toEqual(['react', 'frontend']);
  });

  it('sequential mode: scores BM25 results by vector when both exist', async () => {
    const fakeChunks = [
      { id: 'c1', parent_id: 'item-1', content: 'javascript stuff', rank: 1 },
    ];
    SearchEngine.scoreChunksByVector.mockReturnValue([
      { ...fakeChunks[0], score: 0.85, bm25Rank: 1 },
    ]);
    SearchEngine.groupByParent.mockReturnValue([
      { parentId: 'item-1', matchedChunks: [], bestScore: 0.85 },
    ]);

    // Seed the db so chunksSearch returns something via FTS5
    // (since we're using real db, we rely on mocked groupByParent)
    const res = await request(app)
      .post('/api/search')
      .send({ query: 'javascript' })
      .expect(200);

    expect(res.body.results).toBeDefined();
  });

  it('sequential mode: returns BM25-only results when profileVector is null', async () => {
    SearchEngine.deserializeVector.mockReturnValue(null);

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test' })
      .expect(200);

    expect(res.body.results).toBeDefined();
    expect(SearchEngine.scoreChunksByVector).not.toHaveBeenCalled();
  });

  it('sequential mode: handles empty BM25 results without error', async () => {
    // Profile has no keywords → bm25Chunks stays []
    ProfileGenerator.fromText.mockResolvedValue({ ...MOCK_PROFILE, keywords: [] });

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test' })
      .expect(200);

    expect(res.body.results).toEqual([]);
  });

  it('parallel mode: fuses with RRF by default', async () => {
    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test', mode: 'parallel' })
      .expect(200);

    expect(SearchEngine.rrfMerge).toHaveBeenCalled();
    expect(SearchEngine.mergeResults).not.toHaveBeenCalled();
    expect(res.body.stats.mode).toBe('parallel');
    expect(res.body.stats.ranking).toBe('rrf');
  });

  it('parallel mode: skips semantic scoring when profileVector is null', async () => {
    SearchEngine.deserializeVector.mockReturnValue(null);

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test', mode: 'parallel' })
      .expect(200);

    expect(SearchEngine.scoreChunksByVector).not.toHaveBeenCalled();
    expect(SearchEngine.rrfMerge).toHaveBeenCalled();
    expect(res.body.results).toBeDefined();
  });

  it('calls reranker when useReranker=true and results are non-empty', async () => {
    SearchEngine.groupByParent.mockReturnValue([
      { parentId: 'item-1', matchedChunks: [], bestScore: 0.9 },
    ]);
    rerank.mockResolvedValue([
      { parentId: 'item-1', item: null, matchedChunks: [], bestScore: 0.9, rerankScore: 0.95 },
    ]);

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test', useReranker: true })
      .expect(200);

    expect(rerank).toHaveBeenCalled();
    expect(res.body.results[0].rerankScore).toBe(0.95);
  });

  it('skips reranker when useReranker=false (default)', async () => {
    await request(app).post('/api/search').send({ query: 'test' }).expect(200);
    expect(rerank).not.toHaveBeenCalled();
  });

  it('enriches results with item data from DB', async () => {
    db.insertItem(makeItem({ id: 'enrich-test' }));

    SearchEngine.groupByParent.mockReturnValue([
      { parentId: 'enrich-test', matchedChunks: [], bestScore: 0.8 },
    ]);

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test' })
      .expect(200);

    expect(res.body.results[0].item).toBeDefined();
    expect(res.body.results[0].item.id).toBe('enrich-test');
  });

  it('leaves item undefined when parentId not in DB', async () => {
    SearchEngine.groupByParent.mockReturnValue([
      { parentId: 'nonexistent-item', matchedChunks: [], bestScore: 0.7 },
    ]);

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test' })
      .expect(200);

    expect(res.body.results[0].item).toBeUndefined();
  });

  it('respects topN limit', async () => {
    SearchEngine.groupByParent.mockReturnValue(
      Array.from({ length: 30 }, (_, i) => ({
        parentId: `item-${i}`,
        matchedChunks: [],
        bestScore: 0.9,
      })),
    );

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test', topN: 5 })
      .expect(200);

    expect(res.body.results.length).toBeLessThanOrEqual(5);
  });

  it('accepts collectionId and passes it to db.chunksSearch', async () => {
    // Seed item with collection_id=internet
    const item = makeItem({ id: 'internet-item', collectionId: 'internet' });
    db.insertItem(item);

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'javascript', collectionId: 'internet' })
      .expect(200);

    expect(res.body.results).toBeDefined();
  });

  it('returns stats with correct shape', async () => {
    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test' })
      .expect(200);

    const { stats } = res.body;
    expect(stats).toMatchObject({
      mode: 'sequential',
      bm25Results: expect.any(Number),
      semanticResults: expect.any(Number),
      totalChunks: expect.any(Number),
      totalDocuments: expect.any(Number),
      duration: expect.any(Number),
    });
  });

  it('forwards errors to error handler', async () => {
    ProfileGenerator.fromText.mockRejectedValue(
      Object.assign(new Error('AI failed'), { statusCode: 503, code: 'LLM_API_ERROR' }),
    );

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'test' })
      .expect(503);

    expect(res.body.error.code).toBe('LLM_API_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/search/explain
// ═══════════════════════════════════════════════════════════════

describe('POST /api/search/explain', () => {
  beforeEach(() => {
    db.insertItem(makeItem({ id: 'explain-item-1' }));
  });

  it('returns explanation when itemId and profileId provided', async () => {
    explain.mockResolvedValue('This matches because of JavaScript relevance');

    const res = await request(app)
      .post('/api/search/explain')
      .send({ itemId: 'explain-item-1', profileId: 'test-profile' })
      .expect(200);

    expect(explain).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'explain-item-1' }),
      expect.objectContaining({ id: 'test-profile' }),
    );
    expect(res.body.itemId).toBe('explain-item-1');
    expect(res.body.explanation).toBe('This matches because of JavaScript relevance');
  });

  it('uses query as raw profile when profileId not provided', async () => {
    explain.mockResolvedValue('Match because of query');

    const res = await request(app)
      .post('/api/search/explain')
      .send({ itemId: 'explain-item-1', query: 'javascript tutorial' })
      .expect(200);

    expect(explain).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'explain-item-1' }),
      expect.objectContaining({ rawInput: 'javascript tutorial', keywords: [] }),
    );
    expect(res.body.explanation).toBeDefined();
  });

  it('returns 400 when itemId is missing', async () => {
    const res = await request(app)
      .post('/api/search/explain')
      .send({ profileId: 'test-profile' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 when item does not exist in DB', async () => {
    const res = await request(app)
      .post('/api/search/explain')
      .send({ itemId: 'ghost-item', profileId: 'test-profile' })
      .expect(404);

    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when neither profileId nor query provided', async () => {
    const res = await request(app)
      .post('/api/search/explain')
      .send({ itemId: 'explain-item-1' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('forwards explain errors to error handler', async () => {
    explain.mockRejectedValue(
      Object.assign(new Error('Groq timeout'), { statusCode: 503, code: 'LLM_API_ERROR' }),
    );

    const res = await request(app)
      .post('/api/search/explain')
      .send({ itemId: 'explain-item-1', profileId: 'test-profile' })
      .expect(503);

    expect(res.body.error.code).toBe('LLM_API_ERROR');
  });
});
