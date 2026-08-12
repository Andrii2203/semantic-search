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

async function registerAndGetCookie(email) {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

function addFeed(cookie, url, label) {
  return request(app).post('/api/sources').set('Cookie', cookie).send({ type: 'rss', url, label });
}

describe('src/routes/sources.js', () => {
  let cookie;

  beforeEach(async () => {
    db.init(':memory:');
    cookie = await registerAndGetCookie('sources-user@example.com');
  });

  afterEach(() => db.close());

  test('rejects a request without a session', async () => {
    const res = await request(app).get('/api/sources');

    expect(res.status).toBe(401);
  });

  test('starts a new account with the built in sources enabled', async () => {
    const res = await request(app).get('/api/sources').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const builtins = res.body.sources.filter((source) => source.type === 'builtin');
    expect(builtins.map((source) => source.url).sort()).toEqual(['djinni', 'hn', 'reddit']);
    expect(builtins.every((source) => source.enabled)).toBe(true);
  });

  test('stores a feed the person adds', async () => {
    const res = await addFeed(cookie, 'https://example.test/feed.xml', 'Example');

    expect(res.status).toBe(201);
    expect(res.body.source.url).toBe('https://example.test/feed.xml');
    expect(res.body.source.label).toBe('Example');
    expect(res.body.source.enabled).toBe(true);
  });

  test('rejects a url that is not http or https', async () => {
    const res = await addFeed(cookie, 'javascript:alert(1)', 'Bad');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('rejects an empty url', async () => {
    const res = await addFeed(cookie, '', 'Empty');

    expect(res.status).toBe(400);
  });

  test('switches a source off without deleting it', async () => {
    const created = await addFeed(cookie, 'https://example.test/feed.xml', 'Example');

    const res = await request(app)
      .post(`/api/sources/${created.body.source.id}/toggle`)
      .set('Cookie', cookie)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    const list = await request(app).get('/api/sources').set('Cookie', cookie);
    const stored = list.body.sources.find((source) => source.id === created.body.source.id);
    expect(stored.enabled).toBe(false);
  });

  test('deletes a source', async () => {
    const created = await addFeed(cookie, 'https://example.test/feed.xml', 'Example');

    const res = await request(app)
      .delete(`/api/sources/${created.body.source.id}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const list = await request(app).get('/api/sources').set('Cookie', cookie);
    expect(list.body.sources.find((source) => source.id === created.body.source.id)).toBeUndefined();
  });

  test('does not show one person the sources of another', async () => {
    await addFeed(cookie, 'https://example.test/private.xml', 'Private');
    const otherCookie = await registerAndGetCookie('other-sources-user@example.com');

    const res = await request(app).get('/api/sources').set('Cookie', otherCookie);

    expect(res.body.sources.map((source) => source.url)).not.toContain(
      'https://example.test/private.xml',
    );
  });

  test('does not delete a source that belongs to someone else', async () => {
    const created = await addFeed(cookie, 'https://example.test/private.xml', 'Private');
    const otherCookie = await registerAndGetCookie('thief@example.com');

    const res = await request(app)
      .delete(`/api/sources/${created.body.source.id}`)
      .set('Cookie', otherCookie);

    expect(res.status).toBe(404);
    const list = await request(app).get('/api/sources').set('Cookie', cookie);
    expect(list.body.sources.some((source) => source.id === created.body.source.id)).toBe(true);
  });
});
