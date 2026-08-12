'use strict';

jest.mock('../../src/scheduler');
jest.mock('../../src/config', () => {
  const actual = jest.requireActual('../../src/config');
  return Object.create(actual, {
    sessionSecret: { value: 'test-secret-32-chars-xxxxxxxxxxx', enumerable: true },
    isProduction: { value: false, enumerable: true },
  });
});

const request = require('supertest');
const { app } = require('../../src/server');
const db = require('../../src/db');
const scheduler = require('../../src/scheduler');

async function registerAndGetCookie(email) {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

describe('Profiles API', () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    db.init(':memory:');
    cookie = await registerAndGetCookie('profile-user@example.com');
    userId = db.findUserByEmail('profile-user@example.com').id;
  });

  afterAll(() => db.close());

  beforeEach(() => jest.clearAllMocks());

  test('GET /api/profiles/active without auth → 401', async () => {
    const res = await request(app).get('/api/profiles/active');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/profiles/active before any save → profile null', async () => {
    const res = await request(app).get('/api/profiles/active').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.profile).toBeNull();
  });

  test('POST /api/profiles without rawInput → 400', async () => {
    const res = await request(app).post('/api/profiles').set('Cookie', cookie).send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/profiles with rawInput → 201, returns keywords + id', async () => {
    const res = await request(app)
      .post('/api/profiles')
      .set('Cookie', cookie)
      .send({ rawInput: 'I am interested in Rust, async runtimes and systems design.' });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(Array.isArray(res.body.keywords)).toBe(true);
    expect(res.body.keywords.length).toBeGreaterThan(0);
    expect(scheduler.invalidateProfileCache).toHaveBeenCalledWith(userId);
  });

  test('GET /api/profiles/active after save → returns rawInput + keywords', async () => {
    await request(app)
      .post('/api/profiles')
      .set('Cookie', cookie)
      .send({ rawInput: 'Machine learning, embeddings, vector search topics.' });

    const res = await request(app).get('/api/profiles/active').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.profile.rawInput).toMatch(/embeddings/);
    expect(res.body.profile.keywords.length).toBeGreaterThan(0);
    expect(res.body.profile.updatedAt).toBeDefined();
  });

  test('saving a new profile overwrites the previous one (one active per user)', async () => {
    await request(app).post('/api/profiles').set('Cookie', cookie).send({ rawInput: 'First interest topic about databases.' });
    await request(app).post('/api/profiles').set('Cookie', cookie).send({ rawInput: 'Second interest topic about networking.' });

    const res = await request(app).get('/api/profiles/active').set('Cookie', cookie);
    expect(res.body.profile.rawInput).toMatch(/networking/);
    expect(res.body.profile.rawInput).not.toMatch(/databases/);
  });

  test('profiles are isolated per user', async () => {
    const cookieB = await registerAndGetCookie('profile-user-b@example.com');
    await request(app).post('/api/profiles').set('Cookie', cookieB).send({ rawInput: 'User B cares about cooking recipes only.' });

    const resA = await request(app).get('/api/profiles/active').set('Cookie', cookie);
    expect(resA.body.profile.rawInput).not.toMatch(/cooking/);
  });
});
