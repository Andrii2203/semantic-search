'use strict';

// ─── db level: batchId scoping ────────────────────────────────

describe('Files Match — batchId scoping (db level)', () => {
  const db = require('../src/db');
  const SearchEngine = require('../src/search-engine');

  beforeAll(() => {
    db.init(':memory:');
    db.createUser({ id: 'u1', email: 'fm@x.com', passwordHash: 'h' });

    const vec = SearchEngine.serializeVector(new Array(384).fill(0.1));
    // two files, different batches
    db.insertItem({ id: 'f1', content: 'alpha rust systems', type: 'document', source: 'file-upload', collectionId: 'files', userId: 'u1', metadata: { batchId: 'b1' } });
    db.insertItem({ id: 'f2', content: 'beta python scripting', type: 'document', source: 'file-upload', collectionId: 'files', userId: 'u1', metadata: { batchId: 'b2' } });
    db.insertChunk({ id: 'f1_0', parentId: 'f1', content: 'alpha rust systems', chunkIndex: 0, strategy: 'fixed', vector: vec, metadata: {} });
    db.insertChunk({ id: 'f2_0', parentId: 'f2', content: 'beta python scripting', chunkIndex: 0, strategy: 'fixed', vector: vec, metadata: {} });
  });

  afterAll(() => db.close());

  test('chunksSearch without batchId searches the whole library', () => {
    const all = db.chunksSearch(['alpha', 'beta'], { collectionId: 'files', userId: 'u1' });
    expect(all.map((c) => c.id).sort()).toEqual(['f1_0', 'f2_0']);
  });

  test('chunksSearch with batchId is scoped to that batch only', () => {
    const b1 = db.chunksSearch(['alpha', 'beta'], { collectionId: 'files', userId: 'u1', batchId: 'b1' });
    expect(b1.map((c) => c.id)).toEqual(['f1_0']);
  });

  test('getAllChunksWithVectors respects batchId', () => {
    const all = db.getAllChunksWithVectors({ collectionId: 'files', userId: 'u1' });
    expect(all.map((c) => c.id).sort()).toEqual(['f1_0', 'f2_0']);

    const b2 = db.getAllChunksWithVectors({ collectionId: 'files', userId: 'u1', batchId: 'b2' });
    expect(b2.map((c) => c.id)).toEqual(['f2_0']);
  });
});

// ─── route level: Files Match must not pollute the internet profile ──

describe('Files Match — route does not touch the internet profile', () => {
  jest.resetModules();
  jest.doMock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn() }));
  jest.doMock('../src/profile-generator');
  jest.doMock('../src/reranker', () => ({ rerank: jest.fn() }));
  jest.doMock('../src/explainer', () => ({ explain: jest.fn() }));
  jest.doMock('../src/search-engine');
  jest.doMock('../src/hyde', () => ({ hydeExpand: jest.fn() }));
  jest.doMock('../src/scheduler');
  jest.doMock('../src/groq-client', () => ({}));

  const express = require('express');
  const request = require('supertest');
  const ProfileGenerator = require('../src/profile-generator');
  const SearchEngine = require('../src/search-engine');
  const db = require('../src/db');

  const MOCK_PROFILE = { id: 'p1', keywords: ['rust'], vector: Buffer.from(new Float32Array(384).fill(0.1).buffer) };
  let app;

  beforeAll(() => {
    const searchRouter = require('../src/routes/search');
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.userId = 'u-files'; next(); });
    app.use('/api/search', searchRouter);
    app.use((err, _req, res, _next) => { res.status(err.statusCode || 500).json({ error: { code: err.code, message: err.message } }); });
  });

  beforeEach(() => {
    db.init(':memory:');
    db.createUser({ id: 'u-files', email: 'uf@x.com', passwordHash: 'h' });
    jest.clearAllMocks();
    SearchEngine.deserializeVector.mockReturnValue(new Array(384).fill(0.1));
    SearchEngine.generateEmbedding.mockResolvedValue(new Array(384).fill(0.2));
    SearchEngine.scoreChunksByVector.mockReturnValue([]);
    SearchEngine.rrfMerge.mockReturnValue([]);
    SearchEngine.mmrSelect.mockImplementation((d) => d);
    SearchEngine.groupByParent.mockReturnValue([]);
    ProfileGenerator.fromText.mockResolvedValue(MOCK_PROFILE);
  });

  afterEach(() => db.close());

  test('collectionId=files search does NOT save the user profile', async () => {
    const spy = jest.spyOn(db, 'saveProfileForUser');
    await request(app).post('/api/search').send({ query: 'rust dev', collectionId: 'files' }).expect(200);
    expect(spy).not.toHaveBeenCalled();
    expect(db.getProfileByUserId('u-files')).toBeNull();
    spy.mockRestore();
  });

  test('internet search DOES save the user profile (regression guard)', async () => {
    const spy = jest.spyOn(db, 'saveProfileForUser');
    await request(app).post('/api/search').send({ query: 'rust dev', collectionId: 'internet' }).expect(200);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('batchId is forwarded to the chunk search (scoped Match)', async () => {
    const spy = jest.spyOn(db, 'chunksSearch').mockReturnValue([]);
    await request(app).post('/api/search').send({ query: 'rust dev', collectionId: 'files', batchId: 'batch-123' }).expect(200);
    expect(spy).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ batchId: 'batch-123', collectionId: 'files' }));
    spy.mockRestore();
  });
});
