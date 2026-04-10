'use strict';

jest.mock('../../src/retry', () => ({
  retry: jest.fn((fn) => fn())
}));

const reddit = require('../../src/sources/reddit');

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

describe('Reddit Source (Phase 8)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('fetch: parses reddit JSON correctly and filters items', async () => {
    const mockResponse = { data: { children: [{ data: { id: 'p1', title: 'Reddit Title', selftext: 'Body', permalink: '/r/t/p1', stickied: false } }] } };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });

    const items = await reddit.fetch({ limit: 1 });
    expect(items).toHaveLength(1);
    expect(items[0].metadata.title).toBe('Reddit Title');
  });

  test('fetch: returns empty array on failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const items = await reddit.fetch();
    expect(items).toEqual([]);
  });
});
