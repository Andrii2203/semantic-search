'use strict';

const request = require('supertest');
const { app } = require('../../src/server');
const db = require('../../src/db');

jest.mock('../../src/scheduler');
jest.mock('../../src/routes/export', () => {
  const actual = jest.requireActual('../../src/routes/export');
  return { ...actual, saveToExportFile: jest.fn().mockResolvedValue(undefined) };
});

beforeAll(() => db.init(':memory:'));
afterAll(() => db.close());

describe('POST /api/client-error', () => {
  test('logs error and returns success', async () => {
    const res = await request(app)
      .post('/api/client-error')
      .send({
        message: 'Uncaught TypeError: Cannot read property of undefined',
        stack: 'TypeError: ...\n    at App.jsx:42',
        url: 'http://localhost:5173/',
        userAgent: 'Mozilla/5.0',
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('with empty body → 400 VALIDATION_FAILED', async () => {
    const res = await request(app)
      .post('/api/client-error')
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('with null body → 400', async () => {
    const res = await request(app)
      .post('/api/client-error')
      .send(null);
    expect(res.statusCode).toBe(400);
  });

  test('message only (stack/url optional) → 200', async () => {
    const res = await request(app)
      .post('/api/client-error')
      .send({ message: 'Minimal error' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('route is accessible without auth session (public route)', async () => {
    // Even if password is set, client-error must be public
    const original = process.env.INTERNET_MODE_PASSWORD;
    process.env.INTERNET_MODE_PASSWORD = 'secret';
    const res = await request(app)
      .post('/api/client-error')
      .send({ message: 'public error' });
    expect(res.statusCode).toBe(200);
    process.env.INTERNET_MODE_PASSWORD = original || '';
  });
});
