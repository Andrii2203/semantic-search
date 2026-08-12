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

async function registerAndGetCookie(email) {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

describe('Settings API (Phase 3)', () => {
  let cookie;

  beforeAll(async () => {
    db.init(':memory:');
    cookie = await registerAndGetCookie('settings-user@example.com');
  });

  afterAll(() => db.close());

  beforeEach(() => db.resetSettings());

  test('GET /api/settings without auth → 401', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/settings → returns settings object', async () => {
    const res = await request(app).get('/api/settings').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('settings');
  });

  test('POST /api/settings with unknown key → 400', async () => {
    const res = await request(app).post('/api/settings').set('Cookie', cookie).send({ key: 'nope', value: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/settings valid number persists and is typed', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Cookie', cookie)
      .send({ key: 'searchThreshold', value: 0.42 });
    expect(res.statusCode).toBe(200);

    const got = await request(app).get('/api/settings').set('Cookie', cookie);
    expect(got.body.settings.searchThreshold).toBe(0.42); // number, not "0.42"
    expect(db.getSetting('searchThreshold')).toBe(0.42);
  });

  test('POST /api/settings number out of range → 400', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Cookie', cookie)
      .send({ key: 'searchThreshold', value: 5 });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/settings invalid enum → 400', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Cookie', cookie)
      .send({ key: 'searchMode', value: 'turbo' });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/settings boolean toggle persists', async () => {
    await request(app).post('/api/settings').set('Cookie', cookie).send({ key: 'useHyde', value: true });
    const got = await request(app).get('/api/settings').set('Cookie', cookie);
    expect(got.body.settings.useHyde).toBe(true);
  });

  test('groqApiKey is set-only — never echoed back', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Cookie', cookie)
      .send({ key: 'groqApiKey', value: 'gsk_secret_value_123' });
    expect(res.statusCode).toBe(200);
    expect(res.body.value).not.toContain('secret');

    const got = await request(app).get('/api/settings').set('Cookie', cookie);
    expect(got.body.settings.groqApiKey).toBe('********');
    expect(JSON.stringify(got.body)).not.toContain('gsk_secret_value_123');
    // ...but the real value is stored for the server to use
    expect(db.getSetting('groqApiKey')).toBe('gsk_secret_value_123');
  });

  test('POST /api/settings/reset clears all settings', async () => {
    await request(app).post('/api/settings').set('Cookie', cookie).send({ key: 'topN', value: 30 });
    const res = await request(app).post('/api/settings/reset').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(db.getSetting('topN')).toBeUndefined();
  });
});
