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

const WELCOME = require('../src/welcome');
const WELCOME_COUNT = WELCOME.length;

async function registerAndGetCookie(email) {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

beforeAll(() => db.init(':memory:'));
afterAll(() => db.close());

// ─── Welcome messages (onboarding) ────────────────────────────

describe('Onboarding — welcome messages', () => {
  test('new user gets the welcome messages in their inbox', async () => {
    const cookie = await registerAndGetCookie('welcome-a@example.com');
    const res = await request(app).get('/api/items').set('Cookie', cookie);

    expect(res.statusCode).toBe(200);
    const systemItems = res.body.items.filter((i) => i.source === 'system');
    expect(systemItems).toHaveLength(WELCOME_COUNT);
    // status 'new' so they show in Inbox
    expect(systemItems.every((i) => i.status === 'new')).toBe(true);
  });

  test('welcome messages are stored once in the corpus, isolated per user', async () => {
    await registerAndGetCookie('welcome-b@example.com');
    await registerAndGetCookie('welcome-c@example.com');

    const d = db.getDb();
    // Corpus keeps one row per welcome message regardless of how many registered
    const corpusCount = d.prepare("SELECT COUNT(*) AS c FROM items WHERE source = 'system'").get().c;
    expect(corpusCount).toBe(WELCOME_COUNT);

    // Each user has their own user_matches to the welcome items
    const bId = db.findUserByEmail('welcome-b@example.com').id;
    const bMatches = d
      .prepare(
        "SELECT COUNT(*) AS c FROM user_matches um JOIN items i ON i.id = um.item_id WHERE um.user_id = ? AND i.source = 'system'",
      )
      .get(bId).c;
    expect(bMatches).toBe(WELCOME_COUNT);
  });

  test('registration still succeeds even if welcome seeding throws', async () => {
    const spy = jest.spyOn(db, 'seedWelcomeForUser').mockImplementation(() => {
      throw new Error('boom');
    });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'welcome-resilient@example.com', password: 'password123' });
    expect(res.statusCode).toBe(201);
    spy.mockRestore();
  });
});

// ─── #3: Inbox stats count only the internet collection ───────

describe('Inbox stats — count only internet (Phase 2.6)', () => {
  test('files items do not inflate inbox badge counts', async () => {
    const cookie = await registerAndGetCookie('stats-user@example.com');
    const userId = db.findUserByEmail('stats-user@example.com').id;

    const before = (await request(app).get('/api/items/stats').set('Cookie', cookie)).body.total;
    expect(before).toBe(WELCOME_COUNT); // only the welcome internet items

    // Add a private files item for this user — must NOT change the inbox badge
    db.insertItem({
      id: 'stats-file-1',
      content: 'A private uploaded resume',
      type: 'resume',
      source: 'file-upload',
      collectionId: 'files',
      userId,
      metadata: {},
    });

    const after = (await request(app).get('/api/items/stats').set('Cookie', cookie)).body.total;
    expect(after).toBe(before); // files excluded from inbox counts
  });

  test('internet matches do increase inbox counts', async () => {
    const cookie = await registerAndGetCookie('stats-user-2@example.com');
    const userId = db.findUserByEmail('stats-user-2@example.com').id;

    const before = (await request(app).get('/api/items/stats').set('Cookie', cookie)).body.total;

    db.insertItem({ id: 'net-stats-1', content: 'A shared internet post', type: 'post', source: 'hn', metadata: {} });
    db.upsertUserMatch({ userId, itemId: 'net-stats-1', status: 'new' });

    const after = (await request(app).get('/api/items/stats').set('Cookie', cookie)).body.total;
    expect(after).toBe(before + 1);
  });
});
