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
// Mock dependencies
jest.mock('../src/scheduler');
jest.mock('../src/actions/generate-comment');

describe('Semantic Search API - Senior Integration Suite', () => {
  
  const testItems = [
    { id: 'hn-1', content: 'HN Post', type: 'post', source: 'hn', metadata: { title: 'T1' } },
    { id: 'rd-1', content: 'Reddit Post', type: 'post', source: 'reddit', metadata: { title: 'T2' } },
    { id: 'dj-1', content: 'Djinni Job', type: 'job', source: 'djinni', metadata: { title: 'T3' } }
  ];

  beforeAll(() => {
    db.init(':memory:');
    db.insertItemsBatch(testItems);
  });

  afterAll(() => {
    db.close();
  });

  // ─── Items API (src/routes/items.js) ────────────────────────

  describe('GET /api/items - Branch Coverage (Filters)', () => {
    test('should filter by multiple sources (csv branch)', async () => {
      const res = await request(app).get('/api/items?source=hn,reddit');
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    test('should handle empty results gracefully', async () => {
      const res = await request(app).get('/api/items?source=nonexistent');
      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    test('should fail on invalid query params (validation branch)', async () => {
      const res = await request(app).get('/api/items?limit=999'); // Max is 200
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/items/:id/generate - Logic Branches', () => {
    const generateComment = require('../src/actions/generate-comment');

    test('should successfully generate and save comment', async () => {
        const generateComment = require('../src/actions/generate-comment');
        generateComment.run.mockResolvedValue('Expert AI comment');
        
        const res = await request(app).post('/api/items/hn-1/generate');
        
        // Якщо тут 500, давай подивимось на помилку в логах СІ
        if (res.statusCode === 500) {
            console.error('CI error details:', res.body.error);
        }
        
        expect(res.statusCode).toBe(200);
        expect(res.body.comment).toBe('Expert AI comment');
    });
        
    test('should update existing entry in export file if generated twice', async () => {
      const exportPath = path.join(__dirname, '../data/export.json');
  
        // Робимо запит
        await request(app).post('/api/items/hn-1/generate');
        
        // Перевірка-запобіжник
        expect(fs.existsSync(exportPath)).toBe(true);
        
        const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
        const entry = data.items.find(i => i.id === 'hn-1');
        expect(entry.comment).toBe('Expert AI comment');
    });


    test('should handle AI return null (failure branch)', async () => {
      generateComment.run.mockResolvedValue(null);
      
      const res = await request(app).post('/api/items/rd-1/generate');
      expect(res.statusCode).toBe(500);
      expect(res.body.error.code).toBe('GENERATION_FAILED');
    });

    test('should return 404 for missing item', async () => {
      const res = await request(app).post('/api/items/ghost-id/generate');
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── Export API (src/routes/export.js) ──────────────────────

  describe('GET /api/export - File System Branches', () => {
    const exportPath = path.join(__dirname, '../data/export.json');

    test('should return empty object if file does not exist', async () => {
      if (fs.existsSync(exportPath)) { fs.unlinkSync(exportPath) };
      
      const res = await request(app).get('/api/export');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ items: [] });
    });

    test('should trigger download if file exists', async () => {
      // Setup: Create dummy export file
      if (!fs.existsSync(path.dirname(exportPath))) { fs.mkdirSync(path.dirname(exportPath), { recursive: true }) };
      fs.writeFileSync(exportPath, JSON.stringify({ items: [{ id: '1' }] }));

      const res = await request(app).get('/api/export');
      expect(res.statusCode).toBe(200);
      expect(res.header['content-type']).toContain('application/json');
      expect(res.header['content-disposition']).toContain('attachment');
    });
  });

  // ─── Global Middleware & Sync ───────────────────────────────

  describe('System Integrity', () => {
    test('POST /api/sync should trigger scheduler', async () => {
      scheduler.runCycle.mockResolvedValue({ fetched: 0 });
      await request(app).post('/api/sync');
      expect(scheduler.runCycle).toHaveBeenCalled();
    });
    test('Error handler should catch database errors', async () => {
      const dbSpy = jest.spyOn(db, 'getItemCount').mockImplementation(() => {
        throw new Error('Database Crash');
      });
      const res = await request(app).get('/api/items/stats');
      expect(res.statusCode).toBe(500);
      dbSpy.mockRestore();
    });
  });
});
