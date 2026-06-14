'use strict';

const request = require('supertest');
const { app } = require('../../src/server');
const db = require('../../src/db');

jest.mock('../../src/scheduler');
jest.mock('../../src/routes/export', () => {
  const actual = jest.requireActual('../../src/routes/export');
  return { ...actual, saveToExportFile: jest.fn().mockResolvedValue(undefined) };
});

// ─── Helpers ──────────────────────────────────────────────────

async function registerAndGetCookie(email, password = 'password123') {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

// ─── Cursor pagination ────────────────────────────────────────

describe('GET /api/items — cursor pagination', () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    db.init(':memory:');

    cookie = await registerAndGetCookie('pagtest@example.com');
    userId = db.findUserByEmail('pagtest@example.com').id;

    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${String(i).padStart(2, '0')}`,
      content: `Content ${i}`,
      type: 'post',
      source: 'hn',
      collectionId: 'internet',
      metadata: { title: `Title ${i}` },
    }));
    db.insertItemsBatch(items);
    // v7.1: internet content is a shared corpus — personal visibility via user_matches
    for (const item of items) {
      db.upsertUserMatch({ userId, itemId: item.id });
    }
  });

  afterAll(() => db.close());

  test('no cursor returns first page with limit', async () => {
    const res = await request(app).get('/api/items?limit=5').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.total).toBe(10);
    expect(res.body.limit).toBe(5);
  });

  test('cursor returns next page of results', async () => {
    const page1 = await request(app).get('/api/items?limit=5').set('Cookie', cookie);
    expect(page1.body.nextCursor).toBeDefined();
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app)
      .get(`/api/items?limit=5&cursor=${page1.body.nextCursor}`)
      .set('Cookie', cookie);
    expect(page2.statusCode).toBe(200);
    expect(page2.body.items).toHaveLength(5);

    const ids1 = page1.body.items.map((i) => i.id);
    const ids2 = page2.body.items.map((i) => i.id);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });

  test('last page has hasMore=false and nextCursor=null', async () => {
    const res = await request(app).get('/api/items?limit=20').set('Cookie', cookie);
    expect(res.body.hasMore).toBeFalsy();
    expect(res.body.nextCursor).toBeFalsy();
  });

  test('invalid cursor falls back gracefully (no 400)', async () => {
    const res = await request(app)
      .get('/api/items?cursor=not-valid-base64!')
      .set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  test('collectionId filter works with cursor', async () => {
    const res = await request(app)
      .get('/api/items?collectionId=internet&limit=5')
      .set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    res.body.items.forEach((item) => {
      expect(item.collection_id).toBe('internet');
    });
  });

  test('invalid limit → 400 VALIDATION_FAILED', async () => {
    const res = await request(app).get('/api/items?limit=999').set('Cookie', cookie);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('GET /api/items/stats includes starred count', async () => {
    const res = await request(app).get('/api/items/stats').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('starred');
    expect(typeof res.body.starred).toBe('number');
  });

  test('GET /api/items without auth → 401', async () => {
    const res = await request(app).get('/api/items');
    expect(res.statusCode).toBe(401);
  });
});

// ─── Star ─────────────────────────────────────────────────────

describe('POST /api/items/:id/star', () => {
  test('star an existing item → 200 with status starred', async () => {
    db.init(':memory:');
    const cookie = await registerAndGetCookie('star-test@example.com');
    const userId = db.findUserByEmail('star-test@example.com').id;

    db.insertItemsBatch([
      { id: 'star-test-1', content: 'Hello world content here', type: 'post', source: 'hn', metadata: {} },
    ]);
    db.upsertUserMatch({ userId, itemId: 'star-test-1' });

    const res = await request(app).post('/api/items/star-test-1/star').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('starred');

    // v7.1: personal status for internet content lives in user_matches
    const match = db.getUserMatch(userId, 'star-test-1');
    expect(match.status).toBe('starred');
    db.close();
  });

  test('star a non-existent item → 404', async () => {
    db.init(':memory:');
    const cookie = await registerAndGetCookie('star-test2@example.com');

    const res = await request(app).post('/api/items/does-not-exist/star').set('Cookie', cookie);
    expect(res.statusCode).toBe(404);
    db.close();
  });
});

// ─── Generate (caching) ───────────────────────────────────────

describe('POST /api/items/:id/generate — caching', () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    db.init(':memory:');
    cookie = await registerAndGetCookie('gen-test@example.com');
    userId = db.findUserByEmail('gen-test@example.com').id;

    db.insertItemsBatch([
      { id: 'cached-1', content: 'Content', type: 'post', source: 'hn', userId, metadata: {}, response: 'Cached comment' },
    ]);
  });

  afterAll(() => db.close());

  test('returns cached response without calling AI', async () => {
    const generateComment = require('../../src/actions/generate-comment');
    jest.mock('../../src/actions/generate-comment');
    generateComment.run = jest.fn();

    const res = await request(app).post('/api/items/cached-1/generate').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.comment).toBe('Cached comment');
    expect(res.body.cached).toBe(true);
    expect(generateComment.run).not.toHaveBeenCalled();
  });
});
