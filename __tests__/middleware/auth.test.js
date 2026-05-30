'use strict';

jest.mock('../../src/scheduler');
jest.mock('../../src/routes/export', () => {
  const actual = jest.requireActual('../../src/routes/export');
  return { ...actual, saveToExportFile: jest.fn().mockResolvedValue(undefined) };
});

jest.mock('../../src/config', () => {
  const actual = jest.requireActual('../../src/config');
  return Object.create(actual, {
    sessionSecret: { value: 'test-secret-32-chars-xxxxxxxxxxx', enumerable: true },
    isProduction:  { value: false, enumerable: true },
  });
});

const request = require('supertest');
const { app }  = require('../../src/server');
const db       = require('../../src/db');

const TEST_EMAIL = 'auth-test@example.com';
const TEST_PASS  = 'password123';

beforeAll(() => db.init(':memory:'));
afterAll(()  => db.close());

// ─── Unit: parseCookies ───────────────────────────────────────

describe('Auth helpers — parseCookies', () => {
  const { parseCookies } = require('../../src/middleware/auth');

  test('parses a standard cookie header', () => {
    expect(parseCookies('foo=bar; baz=qux')).toEqual({ foo: 'bar', baz: 'qux' });
  });

  test('handles value containing = sign', () => {
    expect(parseCookies('token=abc=def')).toEqual({ token: 'abc=def' });
  });

  test('returns {} for null or empty', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });
});

// ─── Unit: token sign / verify ────────────────────────────────

describe('Auth helpers — token sign / verify', () => {
  const { createSessionToken, verifySessionToken } = require('../../src/middleware/auth');

  test('createSessionToken + verifySessionToken round-trip returns userId', () => {
    const userId = 'abc-123-def';
    const token = createSessionToken(userId);
    expect(verifySessionToken(token)).toBe(userId);
  });

  test('rejects tampered token → null', () => {
    const token = createSessionToken('user-xyz');
    expect(verifySessionToken(token.slice(0, -4) + 'xxxx')).toBeNull();
  });

  test('rejects null / empty / no-dot tokens → null', () => {
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('nodot')).toBeNull();
  });
});

// ─── Integration: registration + login ───────────────────────

describe('Auth — registration and login', () => {
  let cookie;

  test('GET /api/auth/status without session → authenticated:false', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });

  test('GET /api/items without session → 401', async () => {
    const res = await request(app).get('/api/items');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('GET /api/health (public) → not 401', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).not.toBe(401);
  });

  test('POST /api/auth/login missing email → 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: TEST_PASS });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/auth/register weak password → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'weak@example.com', password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/auth/register → 201 + httpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: TEST_EMAIL, password: TEST_PASS });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);

    const header = res.headers['set-cookie'];
    const cookieStr = Array.isArray(header) ? header[0] : header;
    expect(cookieStr).toMatch(/ume_session=/);
    expect(cookieStr.toLowerCase()).toMatch(/httponly/);
    expect(cookieStr.toLowerCase()).toMatch(/samesite=strict/);
    cookie = cookieStr.split(';')[0];
  });

  test('POST /api/auth/register duplicate email → 409', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: TEST_EMAIL, password: TEST_PASS });
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  test('POST /api/auth/login with wrong password → 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: 'wrongpass' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/auth/login with unknown email → 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@x.com', password: TEST_PASS });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/auth/login with correct credentials → 200 + cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASS });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const header = res.headers['set-cookie'];
    const cookieStr = Array.isArray(header) ? header[0] : header;
    expect(cookieStr).toMatch(/ume_session=/);
    cookie = cookieStr.split(';')[0];
  });

  test('GET /api/items with valid session → 200', async () => {
    const res = await request(app).get('/api/items').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
  });

  test('GET /api/items with invalid session → 401', async () => {
    const res = await request(app).get('/api/items').set('Cookie', 'ume_session=bad.token');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/auth/status with valid session → authenticated:true + email', async () => {
    const res = await request(app).get('/api/auth/status').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.email).toBe(TEST_EMAIL);
  });

  test('POST /api/auth/logout → clears cookie (Max-Age=0)', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect((Array.isArray(setCookie) ? setCookie[0] : setCookie)).toMatch(/Max-Age=0/);
  });

  test('POST /api/client-error (public) → not 401', async () => {
    const res = await request(app).post('/api/client-error').send({ message: 'test' });
    expect(res.statusCode).not.toBe(401);
  });
});

// ─── User isolation ───────────────────────────────────────────

describe('User isolation — User A cannot see User B items', () => {
  let cookieA, cookieB, userIdA, userIdB;

  beforeAll(async () => {
    const resA = await request(app).post('/api/auth/register').send({ email: 'user-a@example.com', password: 'password123' });
    const headerA = resA.headers['set-cookie'];
    cookieA = (Array.isArray(headerA) ? headerA[0] : headerA).split(';')[0];
    userIdA = db.findUserByEmail('user-a@example.com').id;

    const resB = await request(app).post('/api/auth/register').send({ email: 'user-b@example.com', password: 'password123' });
    const headerB = resB.headers['set-cookie'];
    cookieB = (Array.isArray(headerB) ? headerB[0] : headerB).split(';')[0];
    userIdB = db.findUserByEmail('user-b@example.com').id;

    db.insertItemsBatch([
      { id: 'item-a-1', content: 'Article for user A only', type: 'post', source: 'hn', userId: userIdA, metadata: {} },
      { id: 'item-a-2', content: 'Another article for user A', type: 'post', source: 'hn', userId: userIdA, metadata: {} },
    ]);
    db.insertItemsBatch([
      { id: 'item-b-1', content: 'Article for user B only', type: 'post', source: 'reddit', userId: userIdB, metadata: {} },
    ]);
  });

  test('User A sees only their own items', async () => {
    const res = await request(app).get('/api/items').set('Cookie', cookieA);
    expect(res.statusCode).toBe(200);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain('item-a-1');
    expect(ids).toContain('item-a-2');
    expect(ids).not.toContain('item-b-1');
  });

  test('User B sees only their own items', async () => {
    const res = await request(app).get('/api/items').set('Cookie', cookieB);
    expect(res.statusCode).toBe(200);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain('item-b-1');
    expect(ids).not.toContain('item-a-1');
    expect(ids).not.toContain('item-a-2');
  });

  test('User A stats reflect only their items', async () => {
    const res = await request(app).get('/api/items/stats').set('Cookie', cookieA);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
  });

  test('User B stats reflect only their items', async () => {
    const res = await request(app).get('/api/items/stats').set('Cookie', cookieB);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
  });
});
