'use strict';

const request = require('supertest');
const { app } = require('../src/server');
const db = require('../src/db');
const scheduler = require('../src/scheduler');
const fs = require('fs');
const path = require('path');

beforeAll(() => {
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
});

jest.mock('../src/scheduler');
jest.mock('../src/actions/generate-comment');
jest.mock('../src/routes/export', () => {
  const actual = jest.requireActual('../src/routes/export');
  return { ...actual, saveToExportFile: jest.fn().mockResolvedValue(undefined) };
});

describe('Semantic Search API - Senior Integration Suite', () => {
  let authCookie;
  let testUserId;

  beforeAll(async () => {
    db.init(':memory:');

    // Register test user and get session cookie
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'api-test@example.com', password: 'password123' });
    const header = regRes.headers['set-cookie'];
    authCookie = (Array.isArray(header) ? header[0] : header).split(';')[0];
    testUserId = db.findUserByEmail('api-test@example.com').id;

    // v7.1: internet items are a shared corpus — user visibility via user_matches
    const testItems = [
      { id: 'hn-1', content: 'HN Post', type: 'post', source: 'hn', metadata: { title: 'T1' } },
      { id: 'rd-1', content: 'Reddit Post', type: 'post', source: 'reddit', metadata: { title: 'T2' } },
      { id: 'dj-1', content: 'Djinni Job', type: 'job', source: 'djinni', metadata: { title: 'T3' } },
    ];
    db.insertItemsBatch(testItems);
    for (const item of testItems) {
      db.upsertUserMatch({ userId: testUserId, itemId: item.id });
    }
  });

  afterAll(() => {
    db.close();
  });

  // ─── Items API ───────────────────────────────────────────────

  describe('GET /api/items - Branch Coverage (Filters)', () => {
    test('should filter by multiple sources (csv branch)', async () => {
      const res = await request(app).get('/api/items?source=hn,reddit').set('Cookie', authCookie);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    test('should handle empty results gracefully', async () => {
      const res = await request(app).get('/api/items?source=nonexistent').set('Cookie', authCookie);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    test('should fail on invalid query params (validation branch)', async () => {
      const res = await request(app).get('/api/items?limit=999').set('Cookie', authCookie);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/items/:id/generate - Logic Branches', () => {
    const generateComment = require('../src/actions/generate-comment');

    test('should successfully generate and save comment', async () => {
      generateComment.run.mockResolvedValue('Expert AI comment');
      const res = await request(app).post('/api/items/hn-1/generate').set('Cookie', authCookie);
      expect(res.statusCode).toBe(200);
      expect(res.body.comment).toBe('Expert AI comment');
    });

    test('should call saveToExportFile with correct args when comment is generated', async () => {
      const { saveToExportFile } = require('../src/routes/export');
      generateComment.run.mockResolvedValue('Expert AI comment');
      await request(app).post('/api/items/hn-1/generate').set('Cookie', authCookie);
      expect(saveToExportFile).toHaveBeenCalledWith(
        'hn-1',
        expect.objectContaining({ id: 'hn-1' }),
        'Expert AI comment',
      );
    });

    test('should handle AI return null (failure branch)', async () => {
      generateComment.run.mockResolvedValue(null);
      const res = await request(app).post('/api/items/rd-1/generate').set('Cookie', authCookie);
      expect(res.statusCode).toBe(500);
      expect(res.body.error.code).toBe('GENERATION_FAILED');
    });

    test('should return 404 for missing item', async () => {
      const res = await request(app).post('/api/items/ghost-id/generate').set('Cookie', authCookie);
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── Export API ──────────────────────────────────────────────

  describe('GET /api/export - File System Branches', () => {
    const exportPath = path.join(__dirname, '../data/export.json');

    test('should return empty object if file does not exist', async () => {
      if (fs.existsSync(exportPath)) { fs.unlinkSync(exportPath); }
      const res = await request(app).get('/api/export').set('Cookie', authCookie);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ items: [] });
    });

    test('should trigger download if file exists', async () => {
      if (!fs.existsSync(path.dirname(exportPath))) { fs.mkdirSync(path.dirname(exportPath), { recursive: true }); }
      fs.writeFileSync(exportPath, JSON.stringify({ items: [{ id: '1' }] }));
      const res = await request(app).get('/api/export').set('Cookie', authCookie);
      expect(res.statusCode).toBe(200);
      expect(res.header['content-type']).toContain('application/json');
      expect(res.header['content-disposition']).toContain('attachment');
    });
  });

  // ─── Search (authenticated) ──────────────────────────────────

  describe('POST /api/search — authenticated', () => {
    test('search with query saves profile for user', async () => {
      const res = await request(app)
        .post('/api/search')
        .set('Cookie', authCookie)
        .send({ query: 'javascript nodejs', collectionId: 'internet' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('results');
    });
  });

  // ─── System Integrity ────────────────────────────────────────

  describe('System Integrity', () => {
    test('POST /api/sync should trigger scheduler', async () => {
      scheduler.runCycle.mockResolvedValue({ fetched: 0 });
      await request(app).post('/api/sync').set('Cookie', authCookie);
      expect(scheduler.runCycle).toHaveBeenCalled();
    });

    test('Error handler should catch database errors', async () => {
      const dbSpy = jest.spyOn(db, 'getItemCount').mockImplementation(() => {
        throw new Error('Database Crash');
      });
      const res = await request(app).get('/api/items/stats').set('Cookie', authCookie);
      expect(res.statusCode).toBe(500);
      dbSpy.mockRestore();
    });
  });
});
