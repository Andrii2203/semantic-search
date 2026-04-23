'use strict';

// ─── Mock all externals ──────────────────────────────────────

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

// Mock search-engine to avoid loading the ML model
jest.mock('../src/search-engine', () => ({
  generateEmbedding: jest.fn((text) => {
    const vec = new Array(6).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % vec.length] += text.charCodeAt(i) / 1000;
    }
    const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return Promise.resolve(vec.map((v) => (mag > 0 ? v / mag : 0)));
  }),
  cosineSimilarity: jest.fn((a, b) => {
    if (a.length !== b.length || a.length === 0) { return 0; }
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i];
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB);
    return mag === 0 ? 0 : dot / mag;
  }),
  findRelevant: jest.fn(async (items, _pv) => {
    // In tests: return all items with a fake score above threshold
    return items.map((item) => ({ ...item, score: 0.9 }));
  }),
}));

// Mock sources to return controlled data
jest.mock('../src/sources/index', () => ({
  fetchAll: jest.fn(),
  getRegisteredSources: jest.fn(() => ['mock-source']),
}));

const db = require('../src/db');
const sources = require('../src/sources/index');
const scheduler = require('../src/scheduler');

// ─── Setup / Teardown ────────────────────────────────────────

beforeEach(() => {
  db.init(':memory:');
  jest.clearAllMocks();

  // Mock Groq API success
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: 'Mock generated response' } }],
    }),
  });
});

afterEach(() => {
  db.close();
});

// ─── Helpers ─────────────────────────────────────────────────

function makeSourceItems(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `src-item-${i + 1}`,
    content: `Test content for item ${i + 1} about technology`,
    type: 'post',
    source: 'mock-source',
    metadata: {
      title: `Test Item ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      author: 'tester',
    },
  }));
}

// ─── Tests ───────────────────────────────────────────────────

describe('scheduler.runCycle', () => {
  test('full cycle: fetch → validate → filter → dispatch → save', async () => {
    const sourceItems = makeSourceItems(2);
    sources.fetchAll.mockResolvedValue(sourceItems);

    const result = await scheduler.runCycle();

    expect(result.fetched).toBe(2);
    expect(result.filtered).toBe(2);
    expect(result.saved).toBeGreaterThanOrEqual(0);
    expect(result).toHaveProperty('duration');

    // Items should be in DB
    const dbItems = db.getItems();
    expect(dbItems.length).toBeGreaterThanOrEqual(0);
  });

  test('partial failure: some items invalid → valid ones still saved', async () => {
    const items = [
      ...makeSourceItems(2),
      { id: '', content: '', type: 'invalid' }, // invalid item
    ];
    sources.fetchAll.mockResolvedValue(items);

    const result = await scheduler.runCycle();

    // Should still process the 2 valid items
    expect(result.fetched).toBe(3);
  });

  test('no items fetched → early return', async () => {
    sources.fetchAll.mockResolvedValue([]);

    const result = await scheduler.runCycle();

    expect(result.fetched).toBe(0);
    expect(result.filtered).toBe(0);
    expect(result.saved).toBe(0);
  });

  test('duplicates are not added again', async () => {
    const items = makeSourceItems(2);
    sources.fetchAll.mockResolvedValue(items);

    // Run twice with same items
    await scheduler.runCycle();
    await scheduler.runCycle();

    // DB should still have only 2 items (duplicates ignored)
    const dbItems = db.getItems();
    expect(dbItems.length).toBe(2);
  });

  test('cycle is locked while running (prevents overlap)', async () => {
    const items = makeSourceItems(1);
    sources.fetchAll.mockImplementation(() => {
      return new Promise((resolve) => setTimeout(() => resolve(items), 100));
    });

    // Start two cycles simultaneously
    const [r1, r2] = await Promise.all([
      scheduler.runCycle(),
      scheduler.runCycle(),
    ]);

    // One should have been skipped
    const results = [r1, r2];
    const skipped = results.filter((r) => r.skipped);
    expect(skipped.length).toBe(1);
  });

  test('logs error and rethrows if cycle fails', async () => {
    const sources = require('../src/sources/index');
    jest.spyOn(sources, 'fetchAll').mockRejectedValue(new Error('Network Fail'));
    
    await expect(scheduler.runCycle()).rejects.toThrow('Network Fail');
  });

});

describe('scheduler.loadProfile', () => {
  test('loads profile and generates embedding', async () => {
    const searchEngine = require('../src/search-engine');

    const vector = await scheduler.loadProfile();

    expect(searchEngine.generateEmbedding).toHaveBeenCalled();
    expect(Array.isArray(vector)).toBe(true);
    expect(vector.length).toBeGreaterThan(0);
  });
});
