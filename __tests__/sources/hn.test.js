'use strict';

// ─── Mock global fetch ───────────────────────────────────────

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

// ─── Now require the module (after mocking fetch) ────────────

const hn = require('../../src/sources/hn');

// ─── Helpers ─────────────────────────────────────────────────

function makeHNStory(overrides = {}) {
  return {
    id: 12345,
    title: 'Show HN: A new JavaScript framework',
    type: 'story',
    by: 'testuser',
    url: 'https://example.com/framework',
    score: 150,
    descendants: 42,
    text: null,
    ...overrides,
  };
}

function mockFetchResponses(stories) {
  const ids = stories.map((s) => s.id);

  mockFetch.mockImplementation((url) => {
    if (url.includes('topstories.json')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(ids),
      });
    }

    const match = url.match(/item\/(\d+)\.json/);
    if (match) {
      const id = parseInt(match[1], 10);
      const story = stories.find((s) => s.id === id);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(story || null),
      });
    }

    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
  });
}

// ─── Tests ───────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
});

describe('hn source', () => {
  test('has correct name', () => {
    expect(hn.name).toBe('hn');
  });

  test('returns array of valid IR objects', async () => {
    const stories = [
      makeHNStory({ id: 1 }),
      makeHNStory({ id: 2, title: 'Another post' }),
    ];
    mockFetchResponses(stories);

    const items = await hn.fetch({ limit: 2 });

    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('content');
      expect(item.type).toBe('post');
      expect(item.source).toBe('hn');
      expect(item.metadata).toHaveProperty('title');
      expect(item.metadata).toHaveProperty('url');
      expect(item.metadata).toHaveProperty('author');
    }
  });

  test('each IR item has id, content, type, source, metadata', async () => {
    mockFetchResponses([makeHNStory()]);

    const [item] = await hn.fetch({ limit: 1 });

    expect(typeof item.id).toBe('string');
    expect(item.id.length).toBeGreaterThan(0);
    expect(typeof item.content).toBe('string');
    expect(item.content).toContain('A new JavaScript framework');
    expect(item.type).toBe('post');
    expect(item.source).toBe('hn');
    expect(item.metadata.title).toBe('Show HN: A new JavaScript framework');
    expect(item.metadata.author).toBe('testuser');
  });

  test('returns empty array on API error (no throw)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const items = await hn.fetch();
    expect(items).toEqual([]);
  }, 15000);

  test('returns empty array on network error (no throw)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const items = await hn.fetch();
    expect(items).toEqual([]);
  }, 15000);

  test('filters out non-story types', async () => {
    const stories = [
      makeHNStory({ id: 1, type: 'story' }),
      makeHNStory({ id: 2, type: 'job', title: 'Job posting' }),
      makeHNStory({ id: 3, type: 'story', title: 'Third' }),
    ];
    mockFetchResponses(stories);

    const items = await hn.fetch({ limit: 3 });
    expect(items).toHaveLength(2);
  });

  test('filters out stories without title', async () => {
    const stories = [
      makeHNStory({ id: 1 }),
      makeHNStory({ id: 2, title: null }),
      makeHNStory({ id: 3, title: '' }),
    ];
    mockFetchResponses(stories);

    const items = await hn.fetch({ limit: 3 });
    expect(items).toHaveLength(1);
  });

  test('handles HN text with HTML tags (strips them)', async () => {
    const stories = [
      makeHNStory({ id: 1, text: '<p>This is a <b>bold</b> statement</p>' }),
    ];
    mockFetchResponses(stories);

    const [item] = await hn.fetch({ limit: 1 });

    expect(item.content).not.toContain('<p>');
    expect(item.content).not.toContain('<b>');
    expect(item.content).toContain('bold');
  });

  test('generates unique IDs for different stories', async () => {
    const stories = [
      makeHNStory({ id: 100, title: 'First' }),
      makeHNStory({ id: 200, title: 'Second' }),
    ];
    mockFetchResponses(stories);

    const items = await hn.fetch({ limit: 2 });
    expect(items[0].id).not.toBe(items[1].id);
  });

  test('uses HN comment URL when story has no URL', async () => {
    const stories = [makeHNStory({ id: 999, url: undefined })];
    mockFetchResponses(stories);

    const [item] = await hn.fetch({ limit: 1 });
    expect(item.metadata.url).toBe('https://news.ycombinator.com/item?id=999');
  });

  test('all returned items pass Zod IR validation', async () => {
    const { validateIR } = require('../../src/validation');
    const stories = [
      makeHNStory({ id: 1 }),
      makeHNStory({ id: 2, title: 'Another' }),
    ];
    mockFetchResponses(stories);

    const items = await hn.fetch({ limit: 2 });

    for (const item of items) {
      const result = validateIR(item);
      expect(result.success).toBe(true);
    }
  });
});

// ─── fetchAll isolation tests ────────────────────────────────

describe('sources/index fetchAll', () => {
  let sourcesModule;

  beforeEach(() => {
    sourcesModule = require('../../src/sources/index');
  });

  test('one source failing does not block others', async () => {
    sourcesModule.clearSources();

    const goodSource = {
      name: 'good',
      fetch: jest.fn().mockResolvedValue([
        { id: '1', content: 'Test', type: 'post', source: 'good', metadata: {} },
      ]),
    };

    const badSource = {
      name: 'bad',
      fetch: jest.fn().mockRejectedValue(new Error('Source crashed')),
    };

    sourcesModule.register(goodSource);
    sourcesModule.register(badSource);

    const items = await sourcesModule.fetchAll();

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('good');
    expect(badSource.fetch).toHaveBeenCalled();
  });

  test('returns partial results when some sources fail', async () => {
    sourcesModule.clearSources();

    sourcesModule.register({
      name: 'a',
      fetch: () => Promise.resolve([{ id: '1', content: 'A', type: 'post', source: 'a', metadata: {} }]),
    });
    sourcesModule.register({
      name: 'b',
      fetch: () => Promise.reject(new Error('B failed')),
    });
    sourcesModule.register({
      name: 'c',
      fetch: () => Promise.resolve([{ id: '2', content: 'C', type: 'post', source: 'c', metadata: {} }]),
    });

    const items = await sourcesModule.fetchAll();
    expect(items).toHaveLength(2);
  });

  test('register rejects invalid source module', () => {
    expect(() => sourcesModule.register({})).toThrow(/Invalid source module/);
    expect(() => sourcesModule.register({ name: 'x' })).toThrow(/Invalid source module/);
  });
});
