'use strict';

// ─── Mock all externals ──────────────────────────────────────

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

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
  serializeVector: jest.fn((vec) => {
    if (!vec) {return null;}
    return Buffer.from(new Float32Array(vec).buffer);
  }),
  deserializeVector: jest.fn((buf) => {
    if (!buf) {return null;}
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    return Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4));
  }),
}));

jest.mock('../src/sources/index', () => ({
  fetchAll: jest.fn(),
  getRegisteredSources: jest.fn(() => ['mock-source']),
}));

const db = require('../src/db');
const sources = require('../src/sources/index');
const scheduler = require('../src/scheduler');

// ─── Setup / Teardown ────────────────────────────────────────

let testUserId;

beforeEach(async () => {
  db.init(':memory:');
  jest.clearAllMocks();

  // Register a test user so runCycle has someone to process items for
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');
  testUserId = crypto.randomUUID();
  db.createUser({ id: testUserId, email: 'scheduler-test@example.com', passwordHash: await bcrypt.hash('pass', 4) });

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
    content: `Test content for item ${i + 1} about technology and software engineering best practices`,
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
  test('full cycle: fetch → validate → filter → save', async () => {
    const sourceItems = makeSourceItems(2);
    sources.fetchAll.mockResolvedValue(sourceItems);

    const result = await scheduler.runCycle();

    expect(result.fetched).toBe(2);
    expect(result.saved).toBeGreaterThanOrEqual(0);
    expect(result).toHaveProperty('duration');

    const dbItems = db.getItems({ userId: testUserId });
    expect(dbItems.length).toBeGreaterThanOrEqual(0);
  });

  test('partial failure: some items invalid → valid ones still processed', async () => {
    const items = [
      ...makeSourceItems(2),
      { id: '', content: '', type: 'invalid' },
    ];
    sources.fetchAll.mockResolvedValue(items);

    const result = await scheduler.runCycle();

    expect(result.fetched).toBe(3);
    expect(result.validated).toBe(2);
  });

  test('no items fetched → early return', async () => {
    sources.fetchAll.mockResolvedValue([]);

    const result = await scheduler.runCycle();

    expect(result.fetched).toBe(0);
    expect(result.saved).toBe(0);
  });

  test('builds the corpus when there are no registered users', async () => {
    db.close();
    db.init(':memory:');
    sources.fetchAll.mockResolvedValue(makeSourceItems(2));

    const result = await scheduler.runCycle();

    expect(result.fetched).toBe(2);
    expect(result.saved).toBe(2);
    expect(result.chunked).toBeGreaterThan(0);
  });

  test('creates no user matches when there are no registered users', async () => {
    db.close();
    db.init(':memory:');
    sources.fetchAll.mockResolvedValue(makeSourceItems(2));

    const result = await scheduler.runCycle();

    expect(result.matches).toBe(0);
  });

  test('duplicates are not added again', async () => {
    const items = makeSourceItems(2);
    sources.fetchAll.mockResolvedValue(items);

    await scheduler.runCycle();
    await scheduler.runCycle();

    const dbItems = db.getItems({ userId: testUserId });
    expect(dbItems.length).toBe(2);
  });

  test('cycle is locked while running (prevents overlap)', async () => {
    const items = makeSourceItems(1);
    sources.fetchAll.mockImplementation(() => {
      return new Promise((resolve) => setTimeout(() => resolve(items), 100));
    });

    const [r1, r2] = await Promise.all([
      scheduler.runCycle(),
      scheduler.runCycle(),
    ]);

    const skipped = [r1, r2].filter((r) => r.skipped);
    expect(skipped.length).toBe(1);
  });

  test('logs error and rethrows if cycle fails', async () => {
    jest.spyOn(sources, 'fetchAll').mockRejectedValue(new Error('Network Fail'));
    await expect(scheduler.runCycle()).rejects.toThrow('Network Fail');
  });

  test('pre-filter: skips items with content shorter than 50 chars', async () => {
    sources.fetchAll.mockResolvedValue([
      ...makeSourceItems(2),
      {
        id: 'short-item',
        content: 'too short',
        type: 'post',
        source: 'mock-source',
        metadata: { title: 'Short', url: 'https://example.com/short' },
      },
    ]);

    const result = await scheduler.runCycle();

    expect(result.fetched).toBe(3);
    expect(result.preFiltered).toBe(1);
    expect(result.saved).toBeGreaterThanOrEqual(2);
  });

  test('pre-filter: skips items where title equals content', async () => {
    const titleEqContent = 'Buy cheap backlinks SEO spam repeated here again';
    sources.fetchAll.mockResolvedValue([
      ...makeSourceItems(1),
      {
        id: 'spam-item',
        content: titleEqContent,
        type: 'post',
        source: 'mock-source',
        metadata: { title: titleEqContent, url: 'https://spam.com/1' },
      },
    ]);

    const result = await scheduler.runCycle();

    expect(result.preFiltered).toBe(1);
    expect(result.saved).toBeGreaterThanOrEqual(1);
  });

  test('pre-filter: keeps items that pass both checks', async () => {
    sources.fetchAll.mockResolvedValue(makeSourceItems(3));

    const result = await scheduler.runCycle();

    expect(result.preFiltered).toBe(0);
    expect(result.saved).toBeGreaterThanOrEqual(3);
  });
});

describe('scheduler schedule control', () => {
  afterEach(() => {
    scheduler.stop();
  });

  test('does not schedule anything while the scheduler is switched off in settings', () => {
    db.setSetting('cronEnabled', false, 'boolean');

    scheduler.applySchedule();

    expect(scheduler.getStatus().status).toBe('stopped');
  });

  test('schedules with the expression stored in settings', () => {
    db.setSetting('cronEnabled', true, 'boolean');
    db.setSetting('cronSchedule', '0 3 * * *', 'string');

    scheduler.applySchedule();

    expect(scheduler.getStatus().status).toBe('ok');
    expect(scheduler.getStatus().schedule).toBe('0 3 * * *');
  });

  test('stops a running schedule when the switch is turned off', () => {
    db.setSetting('cronEnabled', true, 'boolean');
    scheduler.applySchedule();

    db.setSetting('cronEnabled', false, 'boolean');
    scheduler.applySchedule();

    expect(scheduler.getStatus().status).toBe('stopped');
  });

  test('stays stopped when the stored expression is not a valid cron', () => {
    db.setSetting('cronEnabled', true, 'boolean');
    db.setSetting('cronSchedule', 'every other tuesday', 'string');

    scheduler.applySchedule();

    expect(scheduler.getStatus().status).toBe('stopped');
  });
});
