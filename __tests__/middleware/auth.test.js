'use strict';

// ── Top-level mocks (hoisted, stable across all workers) ──────

jest.mock('../../src/scheduler');
jest.mock('../../src/routes/export', () => {
  const actual = jest.requireActual('../../src/routes/export');
  return { ...actual, saveToExportFile: jest.fn().mockResolvedValue(undefined) };
});

// Mock config so we can toggle internetModePassword at runtime
// without jest.resetModules() (which causes parallel-test flakiness).
const authState = { password: '', secret: 'test-secret-32-chars-xxxxxxxxxxx' };
jest.mock('../../src/config', () => {
  const actual = jest.requireActual('../../src/config');
  return Object.create(actual, {
    internetModePassword: { get: () => authState.password, enumerable: true },
    sessionSecret:        { get: () => authState.secret,   enumerable: true },
    isProduction:         { value: false, enumerable: true },
  });
});

const request = require('supertest');
const { app }  = require('../../src/server');
const db       = require('../../src/db');

beforeAll(() => { authState.password = ''; db.init(':memory:'); });
afterAll(()  => { db.close(); });

// ─── Unit tests — pure helpers, no server ─────────────────────

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

describe('Auth helpers — token sign / verify', () => {
  const { createSessionToken, verifySessionToken } = require('../../src/middleware/auth');

  test('createSessionToken + verifySessionToken round-trip', () => {
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
  });

  test('rejects tampered token', () => {
    const token = createSessionToken();
    expect(verifySessionToken(token.slice(0, -4) + 'xxxx')).toBe(false);
  });

  test('rejects null / empty / no-dot tokens', () => {
    expect(verifySessionToken(null)).toBe(false);
    expect(verifySessionToken('')).toBe(false);
    expect(verifySessionToken('nodot')).toBe(false);
  });
});

// ─── Integration: auth disabled ───────────────────────────────

describe('Auth disabled (no password set)', () => {
  beforeEach(() => { authState.password = ''; });

  test('GET /api/auth/status → authenticated:true, passwordRequired:false', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.passwordRequired).toBe(false);
  });

  test('GET /api/items accessible without session', async () => {
    const res = await request(app).get('/api/items');
    expect(res.statusCode).toBe(200);
  });

  test('POST /api/auth/login with any password → 200', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'anything' });
    expect(res.statusCode).toBe(200);
    expect(res.body.passwordRequired).toBe(false);
  });

  test('GET /api/health (public) → not 401', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).not.toBe(401);
  });
});

// ─── Integration: auth enabled ────────────────────────────────

describe('Auth enabled (password = secret123)', () => {
  let sessionCookie;

  beforeEach(() => { authState.password = 'secret123'; });
  afterEach(()  => { authState.password = ''; });

  test('GET /api/auth/status without session → authenticated:false', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.authenticated).toBe(false);
    expect(res.body.passwordRequired).toBe(true);
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

  test('POST /api/auth/login with wrong password → 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'wrong' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/auth/login correct password → 200 + httpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'secret123' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const header = res.headers['set-cookie'];
    const cookieStr = Array.isArray(header) ? header[0] : header;
    expect(cookieStr).toMatch(/ume_session=/);
    expect(cookieStr.toLowerCase()).toMatch(/httponly/);
    expect(cookieStr.toLowerCase()).toMatch(/samesite=strict/);
    sessionCookie = cookieStr.split(';')[0];
  });

  test('GET /api/items with valid session → 200', async () => {
    // First log in to get a cookie
    const loginRes = await request(app).post('/api/auth/login').send({ password: 'secret123' });
    const header = loginRes.headers['set-cookie'];
    const cookie = (Array.isArray(header) ? header[0] : header).split(';')[0];

    const res = await request(app).get('/api/items').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
  });

  test('GET /api/items with invalid session → 401', async () => {
    const res = await request(app).get('/api/items').set('Cookie', 'ume_session=bad.token');
    expect(res.statusCode).toBe(401);
  });

  test('POST /api/auth/logout → clears cookie (Max-Age=0)', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ password: 'secret123' });
    const header = loginRes.headers['set-cookie'];
    const cookie = (Array.isArray(header) ? header[0] : header).split(';')[0];

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect((Array.isArray(setCookie) ? setCookie[0] : setCookie)).toMatch(/Max-Age=0/);
  });

  test('POST /api/upload (public Files route) → not 401', async () => {
    const res = await request(app).post('/api/upload');
    expect(res.statusCode).not.toBe(401);
  });

  test('POST /api/client-error (public) → not 401', async () => {
    const res = await request(app).post('/api/client-error').send({ message: 'test' });
    expect(res.statusCode).not.toBe(401);
  });
});
