'use strict';

const db = require('../src/db');
const searchEngine = require('../src/search-engine');
const config = require('../src/config');
const { checkDatabase, checkEmbeddingModel, checkGroqAPI, checkFTS5, runStartupChecks } = require('../src/startup');

jest.mock('../src/db');
jest.mock('../src/search-engine');
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  fatal: jest.fn(),
  error: jest.fn()
}));

jest.mock('../src/config', () => ({
  groq: { apiKey: 'default' },
  isProduction: false
}));

describe('Startup Diagnostics', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('checkDatabase', () => {
    it('returns success case', async () => {
      const mockDb = { prepare: jest.fn().mockReturnValue({ get: jest.fn() }) };
      db.getDb.mockReturnValue(mockDb);
      
      const result = await checkDatabase();
      expect(result).toEqual({ ok: true, status: 'ok' });
    });

    it('returns failure case (DB not initialized)', async () => {
      db.getDb.mockImplementation(() => { throw new Error('Not initialized'); });
      
      const result = await checkDatabase();
      expect(result).toEqual({ ok: false, status: 'error', error: 'Not initialized' });
    });
  });

  describe('checkEmbeddingModel', () => {
    it('returns success case (384-dim vector)', async () => {
      searchEngine.generateEmbedding.mockResolvedValue(new Array(384).fill(0));
      
      const result = await checkEmbeddingModel();
      expect(result).toEqual({ ok: true, status: 'ok' });
    });

    it('returns failure case (model not found or invalid dims)', async () => {
      searchEngine.generateEmbedding.mockResolvedValue([1, 2, 3]); // not 384
      
      const result = await checkEmbeddingModel();
      expect(result.ok).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  describe('checkGroqAPI', () => {
    it('returns degraded if no key', async () => {
      config.groq.apiKey = '';
      const result = await checkGroqAPI();
      expect(result).toEqual({ ok: false, status: 'warning', error: 'Missing GROQ_API_KEY' });
    });

    it('returns ok if key present', async () => {
      config.groq.apiKey = 'gsk_something';
      const result = await checkGroqAPI();
      expect(result).toEqual({ ok: true, status: 'ok' });
    });
  });

  describe('checkFTS5', () => {
    it('returns success case', async () => {
      const mockDb = { prepare: jest.fn().mockReturnValue({ get: jest.fn() }) };
      db.getDb.mockReturnValue(mockDb);

      const result = await checkFTS5();
      expect(result).toEqual({ ok: true, status: 'ok' });
    });

    it('returns failure case (FTS5 not available)', async () => {
      db.getDb.mockImplementation(() => { throw new Error('no such table: chunks_fts'); });

      const result = await checkFTS5();
      expect(result.ok).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  describe('runStartupChecks', () => {
    it('returns healthy if all pass', async () => {
      const mockDb = { prepare: jest.fn().mockReturnValue({ get: jest.fn() }) };
      db.getDb.mockReturnValue(mockDb);
      searchEngine.generateEmbedding.mockResolvedValue(new Array(384).fill(0));
      config.groq.apiKey = 'key';

      const result = await runStartupChecks();
      expect(result.status).toBe('healthy');
      expect(result.modules).toEqual({ db: 'ok', embedding: 'ok', groq: 'ok', fts5: 'ok' });
    });

    it('returns degraded if embedding fails (not crash)', async () => {
      const mockDb = { prepare: jest.fn().mockReturnValue({ get: jest.fn() }) };
      db.getDb.mockReturnValue(mockDb);
      searchEngine.generateEmbedding.mockRejectedValue(new Error('Model failed'));
      config.groq.apiKey = 'key';

      const result = await runStartupChecks();
      expect(result.status).toBe('degraded');
      expect(result.modules.embedding).toBe('error');
    });

    it('throws critical error if DB fails (don\'t start)', async () => {
      db.getDb.mockImplementation(() => { throw new Error('DB failed'); });

      await expect(runStartupChecks()).rejects.toThrow('Database check failed: DB failed');
    });
  });
});

