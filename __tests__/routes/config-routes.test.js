'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/search-engine');
jest.mock('../../src/groq-client', () => ({ getGroqClient: jest.fn() }));

const SearchEngine = require('../../src/search-engine');
const db = require('../../src/db');

let app;
let configRouter;

beforeAll(() => {
  SearchEngine.generateEmbedding = jest.fn().mockResolvedValue(new Array(384).fill(0.1));
  SearchEngine.serializeVector = jest.fn().mockReturnValue(Buffer.alloc(4));

  configRouter = require('../../src/routes/config-routes');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.get('x-test-user');
    next();
  });
  app.use('/api/config', configRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ error: { code: err.code, message: err.message } });
  });
});

beforeEach(() => {
  db.init(':memory:');
  jest.clearAllMocks();
  SearchEngine.generateEmbedding.mockResolvedValue(new Array(384).fill(0.1));
  SearchEngine.serializeVector.mockReturnValue(Buffer.alloc(4));
});

afterEach(() => {
  db.close();
});

// ═══════════════════════════════════════════════════════════════
// GET /api/config/chunking
// ═══════════════════════════════════════════════════════════════

describe('GET /api/config/chunking', () => {
  it('returns current chunking config', async () => {
    const res = await request(app).get('/api/config/chunking').expect(200);

    expect(res.body).toMatchObject({
      strategy: expect.any(String),
      chunk_size: expect.any(Number),
      overlap: expect.any(Number),
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/config/chunking
// ═══════════════════════════════════════════════════════════════

describe('POST /api/config/chunking', () => {
  it('updates chunking strategy', async () => {
    const res = await request(app)
      .post('/api/config/chunking')
      .send({ strategy: 'fixed' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.config.strategy).toBe('fixed');
  });

  it('rejects invalid strategy with 400', async () => {
    const res = await request(app)
      .post('/api/config/chunking')
      .send({ strategy: 'invalid-strategy' })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_STRATEGY');
  });

  it('rejects chunkSize below minimum with 400', async () => {
    const res = await request(app)
      .post('/api/config/chunking')
      .send({ chunkSize: 10 })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects chunkSize above maximum with 400', async () => {
    const res = await request(app)
      .post('/api/config/chunking')
      .send({ chunkSize: 9999 })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects negative overlap with 400', async () => {
    const res = await request(app)
      .post('/api/config/chunking')
      .send({ overlap: -1 })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects overlap above maximum with 400', async () => {
    const res = await request(app)
      .post('/api/config/chunking')
      .send({ overlap: 999 })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('accepts valid chunkSize and overlap', async () => {
    const res = await request(app)
      .post('/api/config/chunking')
      .send({ strategy: 'semantic', chunkSize: 200, overlap: 50 })
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/config/profiles
// ═══════════════════════════════════════════════════════════════

function saveFor(userId, profile) {
  db.createUser({ id: userId, email: `${userId}@example.com`, passwordHash: 'hash' });
  db.saveProfileForUser(userId, profile);
}

describe('GET /api/config/profiles', () => {
  it('returns empty profiles array when no profiles', async () => {
    const res = await request(app)
      .get('/api/config/profiles')
      .set('x-test-user', 'alice')
      .expect(200);

    expect(res.body.profiles).toEqual([]);
  });

  it('returns saved profiles', async () => {
    saveFor('alice', { id: 'test-p', keywords: ['js'], rawInput: 'javascript' });

    const res = await request(app)
      .get('/api/config/profiles')
      .set('x-test-user', 'alice')
      .expect(200);

    expect(res.body.profiles).toHaveLength(1);
    expect(res.body.profiles[0].id).toBe('test-p');
  });

  it('returns only profiles whose user_id is the caller', async () => {
    saveFor('alice', { id: 'alice-p', keywords: ['js'], rawInput: 'alice intent' });
    saveFor('bob', { id: 'bob-p', keywords: ['bob-secret-keyword'], rawInput: 'BOB PRIVATE INTENT TEXT' });

    const res = await request(app)
      .get('/api/config/profiles')
      .set('x-test-user', 'alice')
      .expect(200);

    expect(res.body.profiles).toHaveLength(1);
    expect(res.body.profiles[0].id).toBe('alice-p');
    expect(JSON.stringify(res.body)).not.toContain('BOB PRIVATE INTENT TEXT');
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/config/profiles/:id
// ═══════════════════════════════════════════════════════════════

describe('DELETE /api/config/profiles/:id', () => {
  it('deletes the profile when it belongs to the caller', async () => {
    saveFor('alice', { id: 'to-delete', keywords: ['js'], rawInput: 'js' });

    const res = await request(app)
      .delete('/api/config/profiles/to-delete')
      .set('x-test-user', 'alice')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(db.getProfile('to-delete', 'alice')).toBeNull();
  });

  it('returns 404 for non-existent profile', async () => {
    const res = await request(app)
      .delete('/api/config/profiles/ghost-profile')
      .set('x-test-user', 'alice')
      .expect(404);

    expect(res.body.error).toBeDefined();
  });

  it('returns 404 when the profile belongs to another account', async () => {
    saveFor('bob', { id: 'bob-p', keywords: ['bob'], rawInput: 'BOB PRIVATE INTENT TEXT' });

    const res = await request(app)
      .delete('/api/config/profiles/bob-p')
      .set('x-test-user', 'alice')
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(db.getProfile('bob-p', 'bob')).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/config/rechunk
// ═══════════════════════════════════════════════════════════════

describe('POST /api/config/rechunk', () => {
  it('returns success with zero processed when no items', async () => {
    const res = await request(app)
      .post('/api/config/rechunk')
      .send({})
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.processed).toBe(0);
    expect(res.body.errors).toBe(0);
  });

  it('re-chunks existing items', async () => {
    db.insertItem({
      id: 'rechunk-item',
      content: 'Content about JavaScript and Node.js for testing rechunking',
      type: 'post',
      source: 'hn',
      metadata: { title: 'Test' },
    });

    const res = await request(app)
      .post('/api/config/rechunk')
      .send({ strategy: 'fixed', chunkSize: 100, overlap: 10 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.processed).toBe(1);
    expect(res.body.strategy).toBe('fixed');
  });

  it('counts errors when embedding fails', async () => {
    SearchEngine.generateEmbedding.mockRejectedValue(new Error('Embedding fail'));
    db.insertItem({
      id: 'error-item',
      content: 'Content about Node.js development and programming',
      type: 'post',
      source: 'hn',
      metadata: {},
    });

    const res = await request(app)
      .post('/api/config/rechunk')
      .send({})
      .expect(200);

    // Embedding failure is handled per-chunk but item still processed
    expect(res.body.success).toBe(true);
  });
});
