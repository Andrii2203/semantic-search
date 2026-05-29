'use strict';

const request = require('supertest');
const { app } = require('../../src/server');
const db = require('../../src/db');

jest.mock('../../src/scheduler');
jest.mock('../../src/routes/export', () => {
  const actual = jest.requireActual('../../src/routes/export');
  return { ...actual, saveToExportFile: jest.fn().mockResolvedValue(undefined) };
});

describe('GET /api/items — cursor pagination', () => {
  beforeAll(() => {
    db.init(':memory:');

    // Insert 10 items with deterministic created_at to test ordering
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${String(i).padStart(2, '0')}`,
      content: `Content ${i}`,
      type: 'post',
      source: 'hn',
      collectionId: 'internet',
      metadata: { title: `Title ${i}` },
    }));
    db.insertItemsBatch(items);
  });

  afterAll(() => db.close());

  test('no cursor returns first page with limit', async () => {
    const res = await request(app).get('/api/items?limit=5');
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.total).toBe(10);
    expect(res.body.limit).toBe(5);
  });

  test('cursor returns next page of results', async () => {
    // Get first page
    const page1 = await request(app).get('/api/items?limit=5');
    expect(page1.body.nextCursor).toBeDefined();
    expect(page1.body.hasMore).toBe(true);

    // Get second page using cursor
    const page2 = await request(app).get(`/api/items?limit=5&cursor=${page1.body.nextCursor}`);
    expect(page2.statusCode).toBe(200);
    expect(page2.body.items).toHaveLength(5);

    // Pages must not overlap
    const ids1 = page1.body.items.map((i) => i.id);
    const ids2 = page2.body.items.map((i) => i.id);
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  test('last page has hasMore=false and nextCursor=null', async () => {
    // Get all 10 with large limit
    const res = await request(app).get('/api/items?limit=20');
    expect(res.body.hasMore).toBeFalsy();
    expect(res.body.nextCursor).toBeFalsy();
  });

  test('invalid cursor falls back gracefully (no 400)', async () => {
    const res = await request(app).get('/api/items?cursor=not-valid-base64!');
    // Should not crash — returns first page
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  test('collectionId filter works with cursor', async () => {
    const res = await request(app).get('/api/items?collectionId=internet&limit=5');
    expect(res.statusCode).toBe(200);
    res.body.items.forEach((item) => {
      expect(item.collection_id).toBe('internet');
    });
  });

  test('invalid limit → 400 VALIDATION_FAILED', async () => {
    const res = await request(app).get('/api/items?limit=999');
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('GET /api/items/stats includes starred count', async () => {
    const res = await request(app).get('/api/items/stats');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('starred');
    expect(typeof res.body.starred).toBe('number');
  });
});

describe('POST /api/items/:id/star', () => {
  beforeAll(() => {
    // DB already initialized above — reuse the same instance
    if (!db.getDb) return; // guard
    try { db.init(':memory:'); } catch {}
  });

  test('star an existing item → 200 with status starred', async () => {
    db.init(':memory:');
    db.insertItemsBatch([
      { id: 'star-test-1', content: 'Hello', type: 'post', source: 'hn', metadata: {} },
    ]);

    const res = await request(app).post('/api/items/star-test-1/star');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('starred');

    const item = db.getItemById('star-test-1');
    expect(item.status).toBe('starred');
    db.close();
  });

  test('star a non-existent item → 404', async () => {
    db.init(':memory:');
    const res = await request(app).post('/api/items/does-not-exist/star');
    expect(res.statusCode).toBe(404);
    db.close();
  });
});

describe('POST /api/items/:id/generate — caching', () => {
  beforeAll(() => {
    db.init(':memory:');
    db.insertItemsBatch([
      { id: 'cached-1', content: 'Content', type: 'post', source: 'hn', metadata: {}, response: 'Cached comment' },
    ]);
  });

  afterAll(() => db.close());

  test('returns cached response without calling AI', async () => {
    const generateComment = require('../../src/actions/generate-comment');
    jest.mock('../../src/actions/generate-comment');
    generateComment.run = jest.fn();

    const res = await request(app).post('/api/items/cached-1/generate');
    expect(res.statusCode).toBe(200);
    expect(res.body.comment).toBe('Cached comment');
    expect(res.body.cached).toBe(true);
    expect(generateComment.run).not.toHaveBeenCalled();
  });
});
