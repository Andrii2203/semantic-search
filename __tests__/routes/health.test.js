'use strict';

const express = require('express');
const request = require('supertest');
const healthRouter = require('../../src/routes/health');
const startup = require('../../src/startup');
const scheduler = require('../../src/scheduler');

jest.mock('../../src/startup');
jest.mock('../../src/scheduler', () => ({
  getStatus: jest.fn()
}));

describe('Health Endpoint', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use('/api/health', healthRouter);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('GET /api/health returns all module statuses', async () => {
    startup.getLastStatus.mockReturnValue({
      status: 'healthy',
      modules: { db: 'ok', embedding: 'ok', groq: 'ok', fts5: 'ok' }
    });
    scheduler.getStatus.mockReturnValue({ status: 'ok' });

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.modules.db).toBe('ok');
    expect(response.body.modules.scheduler).toBe('ok');
    expect(response.body.uptime).toBeDefined();
    expect(response.body.timestamp).toBeDefined();
  });

  it('GET /api/health reflects degraded state', async () => {
    startup.getLastStatus.mockReturnValue({
      status: 'degraded',
      modules: { db: 'ok', embedding: 'error', groq: 'warning', fts5: 'ok' }
    });
    scheduler.getStatus.mockReturnValue({ status: 'stopped' });

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.modules.embedding).toBe('error');
    expect(response.body.modules.groq).toBe('warning');
    expect(response.body.modules.scheduler).toBe('stopped');
  });
});
