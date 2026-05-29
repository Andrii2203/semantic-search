'use strict';

jest.mock('groq-sdk', () => {
  const mockCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

jest.mock('../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const Groq = require('groq-sdk');

describe('GroqClient', () => {
  let GroqClient, getGroqClient, resetGroqClient;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.mock('groq-sdk', () => {
      const mockCreate = jest.fn();
      return jest.fn().mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      }));
    });
    jest.mock('../src/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    }));
    ({ GroqClient, getGroqClient, resetGroqClient } = require('../src/groq-client'));
  });

  describe('constructor', () => {
    it('creates a GroqClient instance with rate limiter', () => {
      const client = new GroqClient({ apiKey: 'test-key', rateLimit: 10 });
      expect(client).toBeDefined();
      expect(client.maxPerMinute).toBe(10);
      expect(client.timestamps).toEqual([]);
    });
  });

  describe('chat', () => {
    it('calls groq API and returns content', async () => {
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Hello response' } }],
      });
      const MockGroq = require('groq-sdk');
      MockGroq.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      }));

      const { GroqClient: FreshClient } = require('../src/groq-client');
      const client = new FreshClient({ apiKey: 'key', rateLimit: 100 });
      const result = await client.chat([{ role: 'user', content: 'test' }]);

      expect(mockCreate).toHaveBeenCalled();
      expect(result).toBe('Hello response');
    });

    it('returns empty string when choices are empty', async () => {
      const mockCreate = jest.fn().mockResolvedValue({ choices: [] });
      const MockGroq = require('groq-sdk');
      MockGroq.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      }));

      const { GroqClient: FreshClient } = require('../src/groq-client');
      const client = new FreshClient({ apiKey: 'key', rateLimit: 100 });
      const result = await client.chat([{ role: 'user', content: 'test' }]);

      expect(result).toBe('');
    });

    it('throws and logs on API error', async () => {
      const mockCreate = jest.fn().mockRejectedValue(new Error('API Error'));
      const MockGroq = require('groq-sdk');
      MockGroq.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      }));

      const { GroqClient: FreshClient } = require('../src/groq-client');
      const client = new FreshClient({ apiKey: 'key', rateLimit: 100 });

      await expect(client.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('API Error');
    });
  });

  describe('waitForSlot', () => {
    it('does not wait when under rate limit', async () => {
      const client = new GroqClient({ apiKey: 'key', rateLimit: 100 });
      const start = Date.now();
      await client.waitForSlot();
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('filters out old timestamps outside 60s window', async () => {
      const client = new GroqClient({ apiKey: 'key', rateLimit: 5 });
      // Inject old timestamps (>60s ago)
      client.timestamps = [Date.now() - 70_000, Date.now() - 65_000];
      await client.waitForSlot(); // should not block
      expect(client.timestamps.length).toBe(1); // only the one just added
    });
  });

  describe('getGroqClient singleton', () => {
    it('returns same instance on repeated calls', () => {
      const a = getGroqClient();
      const b = getGroqClient();
      expect(a).toBe(b);
    });

    it('resetGroqClient creates a fresh instance', () => {
      const a = getGroqClient();
      resetGroqClient();
      const b = getGroqClient();
      expect(a).not.toBe(b);
    });
  });
});
