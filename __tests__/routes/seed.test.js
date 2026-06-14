'use strict';

jest.mock('../../src/scheduler');
jest.mock('../../src/config', () => {
  const actual = jest.requireActual('../../src/config');
  return Object.create(actual, {
    sessionSecret: { value: 'test-secret-32-chars-xxxxxxxxxxx', enumerable: true },
    isProduction: { value: false, enumerable: true, configurable: true, writable: true },
  });
});

const request = require('supertest');
const { app } = require('../../src/server');
const db = require('../../src/db');
const config = require('../../src/config');
const SearchEngine = require('../../src/search-engine');
const { SEED_POSTS } = require('../../src/seed');

// Deterministic fake embedding — avoids loading the real model in this plumbing test
let embedSpy;

async function registerAndGetCookie(email) {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

describe('POST /api/seed-test-data', () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    db.init(':memory:');
    embedSpy = jest.spyOn(SearchEngine, 'generateEmbedding').mockResolvedValue(new Array(384).fill(0.1));
    cookie = await registerAndGetCookie('seed-user@example.com');
    userId = db.findUserByEmail('seed-user@example.com').id;
  });

  afterAll(() => {
    embedSpy.mockRestore();
    db.close();
  });

  test('requires auth → 401', async () => {
    const res = await request(app).post('/api/seed-test-data');
    expect(res.statusCode).toBe(401);
  });

  test('inserts the full synthetic dataset under __test__', async () => {
    const res = await request(app).post('/api/seed-test-data').set('Cookie', cookie);
    expect(res.statusCode).toBe(201);
    expect(res.body.inserted).toBe(SEED_POSTS.length);
    expect(res.body.collectionId).toBe('__test__');

    const items = db.getItems({ collectionId: '__test__', userId, limit: 100 });
    expect(items).toHaveLength(SEED_POSTS.length);
  });

  test('re-seeding clears previous seed items (no duplication)', async () => {
    await request(app).post('/api/seed-test-data').set('Cookie', cookie);
    const items = db.getItems({ collectionId: '__test__', userId, limit: 100 });
    expect(items).toHaveLength(SEED_POSTS.length);
  });

  test('seed data is isolated per user', async () => {
    const cookieB = await registerAndGetCookie('seed-user-b@example.com');
    const userIdB = db.findUserByEmail('seed-user-b@example.com').id;

    const itemsB = db.getItems({ collectionId: '__test__', userId: userIdB, limit: 100 });
    expect(itemsB).toHaveLength(0);

    await request(app).post('/api/seed-test-data').set('Cookie', cookieB);
    const itemsBAfter = db.getItems({ collectionId: '__test__', userId: userIdB, limit: 100 });
    expect(itemsBAfter).toHaveLength(SEED_POSTS.length);
  });

  test('refused in production → 403', async () => {
    config.isProduction = true;
    const res = await request(app).post('/api/seed-test-data').set('Cookie', cookie);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    config.isProduction = false;
  });
});
