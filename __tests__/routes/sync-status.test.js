'use strict';

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

async function setSetting(cookie, key, value) {
  return request(app).post('/api/settings').set('Cookie', cookie).send({ key, value });
}

describe('src/routes/sync.js', () => {
  let cookie;

  beforeAll(async () => {
    db.init(':memory:');
    cookie = await registerAndGetCookie('sync-status-user@example.com');
  });

  afterAll(() => {
    scheduler.stop();
    db.close();
  });

  test('reports the scheduler as stopped after it is switched off in settings', async () => {
    await setSetting(cookie, 'cronEnabled', false);

    const res = await request(app).get('/api/sync/status').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('stopped');
  });

  test('reports the cron expression that is actually scheduled', async () => {
    await setSetting(cookie, 'cronSchedule', '0 3 * * *');
    await setSetting(cookie, 'cronEnabled', true);

    const res = await request(app).get('/api/sync/status').set('Cookie', cookie);

    expect(res.body.status).toBe('ok');
    expect(res.body.schedule).toBe('0 3 * * *');
  });

  test('applies a new cron expression without a restart', async () => {
    await setSetting(cookie, 'cronEnabled', true);
    await setSetting(cookie, 'cronSchedule', '15 * * * *');

    const res = await request(app).get('/api/sync/status').set('Cookie', cookie);

    expect(res.body.schedule).toBe('15 * * * *');
  });
});
