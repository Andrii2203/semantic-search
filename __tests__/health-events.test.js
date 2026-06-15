'use strict';

jest.mock('../src/scheduler');
jest.mock('../src/config', () => {
  const actual = jest.requireActual('../src/config');
  return Object.create(actual, {
    sessionSecret: { value: 'test-secret-32-chars-xxxxxxxxxxx', enumerable: true },
    isProduction: { value: false, enumerable: true },
  });
});

const request = require('supertest');
const { app } = require('../src/server');
const db = require('../src/db');
const scheduler = require('../src/scheduler');
const events = require('../src/events');
const healthChecker = require('../src/health-checker');

async function registerAndGetCookie(email) {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

beforeAll(() => db.init(':memory:'));
afterAll(() => db.close());

beforeEach(() => {
  scheduler.getStatus.mockReturnValue({ status: 'stopped', isRunning: false, currentStep: null, lastResult: null });
  healthChecker.clearCache();
  jest.clearAllMocks();
});

// ─── GET /api/health/full ─────────────────────────────────────

describe('GET /api/health/full', () => {
  test('returns live per-module status (public)', async () => {
    const res = await request(app).get('/api/health/full');
    expect(res.statusCode).toBe(200);
    expect(['healthy', 'degraded', 'critical']).toContain(res.body.status);
    expect(res.body.modules).toHaveProperty('db');
    expect(res.body.modules).toHaveProperty('fts5');
    expect(res.body.modules).toHaveProperty('groq');
    expect(res.body.modules).toHaveProperty('scheduler');
    expect(res.body).toHaveProperty('checkedAt');
    expect(res.body).toHaveProperty('uptime');
  });

  test('caches within the TTL (second call is served from cache)', async () => {
    healthChecker.clearCache();
    const first = await request(app).get('/api/health/full');
    expect(first.body.cached).toBe(false);
    const second = await request(app).get('/api/health/full');
    expect(second.body.cached).toBe(true);
  });
});

// ─── Business events ──────────────────────────────────────────

describe('Business events', () => {
  test('events.emit does not throw', () => {
    expect(() => events.emit('test.event', { a: 1 })).not.toThrow();
  });

  test('approving an item emits item.approved', async () => {
    const cookie = await registerAndGetCookie('events-user@example.com');
    const userId = db.findUserByEmail('events-user@example.com').id;

    db.insertItem({ id: 'ev-item-1', content: 'A post to approve', type: 'post', source: 'hn', metadata: {} });
    db.upsertUserMatch({ userId, itemId: 'ev-item-1', status: 'new' });

    const spy = jest.spyOn(events, 'emit');
    const res = await request(app).post('/api/items/ev-item-1/approve').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);

    expect(spy).toHaveBeenCalledWith('item.approved', expect.objectContaining({ itemId: 'ev-item-1', userId }));
    spy.mockRestore();
  });
});
