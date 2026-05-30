'use strict';

const request = require('supertest');
const db = require('../src/db');

jest.mock('../src/scheduler', () => ({
  runCycle: jest.fn().mockResolvedValue({}),
  start: jest.fn(),
  stop: jest.fn(),
  getStatus: jest.fn(() => ({ status: 'stopped', isRunning: false, currentStep: null, lastResult: null })),
  invalidateProfileCache: jest.fn(),
  loadProfile: jest.fn(),
}));

// Initialize in-memory DB before importing app
db.init(':memory:');

const { app } = require('../src/server');

// ─── Auth helper ──────────────────────────────────────────────

let authCookie;
let testUserId;

async function ensureAuth() {
  if (authCookie) return authCookie;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'server-test@example.com', password: 'password123' });
  const header = res.headers['set-cookie'];
  authCookie = (Array.isArray(header) ? header[0] : header).split(';')[0];
  testUserId = db.findUserByEmail('server-test@example.com').id;
  return authCookie;
}

// ─── Helpers ─────────────────────────────────────────────────

function seedItems(userId) {
  db.insertItem({
    id: 'item-1', content: 'Test post about JavaScript', type: 'post', source: 'hn',
    metadata: { title: 'JS Post', url: 'https://example.com/1', author: 'user1' },
    status: 'new', response: 'Great post!', score: 0.85, userId,
  });
  db.insertItem({
    id: 'item-2', content: 'Another post about Node.js', type: 'post', source: 'reddit',
    metadata: { title: 'Node Tips', url: 'https://example.com/2' }, status: 'approved', userId,
  });
  db.insertItem({
    id: 'item-3', content: 'Job posting for developer', type: 'job', source: 'djinni',
    metadata: { title: 'Senior Dev', company: 'Acme' }, status: 'new', userId,
  });
}

// ─── Setup / Teardown ────────────────────────────────────────

beforeAll(async () => {
  await ensureAuth();
});

beforeEach(() => {
  db.getDb().exec('DELETE FROM items');
});

afterAll(() => {
  db.close();
});

// ─── Health Check ────────────────────────────────────────────

describe('GET /api/health', () => {
  test('returns ok status with db connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(['healthy', 'degraded', 'unknown']).toContain(res.body.status);
    expect(res.body).toHaveProperty('modules');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
  });
});

// ─── GET /api/items ──────────────────────────────────────────

describe('GET /api/items', () => {
  test('returns 200 with array of items', async () => {
    seedItems(testUserId);
    const res = await request(app).get('/api/items').set('Cookie', authCookie);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(3);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('limit');
  });

  test('filters by status=new', async () => {
    seedItems(testUserId);
    const res = await request(app).get('/api/items?status=new').set('Cookie', authCookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.items.length).toBe(2);
    expect(res.body.items.every((i) => i.status === 'new')).toBe(true);
  });

  test('returns empty array when no items', async () => {
    const res = await request(app).get('/api/items').set('Cookie', authCookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('rejects invalid status query', async () => {
    const res = await request(app).get('/api/items?status=invalid_status').set('Cookie', authCookie);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toHaveProperty('code', 'VALIDATION_FAILED');
  });
});

// ─── GET /api/items/stats ────────────────────────────────────

describe('GET /api/items/stats', () => {
  test('returns counts by status', async () => {
    seedItems(testUserId);
    const res = await request(app).get('/api/items/stats').set('Cookie', authCookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.new).toBe(2);
    expect(res.body.approved).toBe(1);
    expect(res.body.skipped).toBe(0);
  });
});

// ─── POST /api/items/:id/approve ─────────────────────────────

describe('POST /api/items/:id/approve', () => {
  test('approves existing item and changes status in DB', async () => {
    seedItems(testUserId);
    const res = await request(app).post('/api/items/item-1/approve').set('Cookie', authCookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('approved');
    const item = db.getItemById('item-1');
    expect(item.status).toBe('approved');
  });

  test('returns 404 for nonexistent item with JSON error', async () => {
    const res = await request(app).post('/api/items/nonexistent-id/approve').set('Cookie', authCookie);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
  });
});

// ─── POST /api/items/:id/skip ────────────────────────────────

describe('POST /api/items/:id/skip', () => {
  test('skips existing item', async () => {
    seedItems(testUserId);
    const res = await request(app).post('/api/items/item-1/skip').set('Cookie', authCookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('skipped');
    const item = db.getItemById('item-1');
    expect(item.status).toBe('skipped');
  });

  test('returns 404 for nonexistent item', async () => {
    const res = await request(app).post('/api/items/invalid-id/skip').set('Cookie', authCookie);
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ─── 404 Unknown Routes ─────────────────────────────────────

describe('Unknown routes', () => {
  test('returns 404 JSON error for unknown route', async () => {
    const res = await request(app).get('/api/nonexistent').set('Cookie', authCookie);
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Route not found');
  });
});

// ─── Security ────────────────────────────────────────────────

describe('Security headers', () => {
  test('includes security headers from helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(res.headers).toHaveProperty('x-frame-options');
  });
});
