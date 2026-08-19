'use strict';

jest.mock('../../src/retry', () => ({
  retry: jest.fn((fn) => fn()),
}));

const { fetchFeed } = require('../../src/sources/rss');
const constants = require('../../src/search-constants');

const feedWithBody = (body) => `<rss version="2.0"><channel>
  <item>
    <title>Consensus in practice</title>
    <link>https://example.test/consensus</link>
    <description>${body}</description>
  </item>
</channel></rss>`;

const FEED = `<rss version="2.0"><channel>
  <item>
    <title>Consensus in practice</title>
    <link>https://example.test/consensus</link>
    <description>What Raft costs once you run it for real.</description>
    <author>ada</author>
  </item>
</channel></rss>`;

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

describe('src/sources/rss.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns one IR item per feed entry, tagged with the feed it came from', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(FEED) });

    const items = await fetchFeed('https://example.test/feed.xml');

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('rss');
    expect(items[0].metadata.feedUrl).toBe('https://example.test/feed.xml');
    expect(items[0].metadata.url).toBe('https://example.test/consensus');
  });

  test('puts the title and the body into the content the engine embeds', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(FEED) });

    const [item] = await fetchFeed('https://example.test/feed.xml');

    expect(item.content).toContain('Consensus in practice');
    expect(item.content).toContain('What Raft costs');
  });

  test('stores a body longer than articleBodyChars cut to exactly that length, and a shorter one whole', async () => {
    const long = 'word '.repeat(constants.articleBodyChars).slice(0, constants.articleBodyChars + 500);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(feedWithBody(long)) });

    const [cut] = await fetchFeed('https://example.test/feed.xml');
    const body = cut.content.split('\n\n')[1];
    expect(body).toHaveLength(constants.articleBodyChars);

    const short = 'a'.repeat(constants.articleBodyChars - 1);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(feedWithBody(short)) });

    const [whole] = await fetchFeed('https://example.test/feed.xml');
    expect(whole.content.split('\n\n')[1]).toHaveLength(short.length);
  });

  test('stores an article of median length, being 4128 characters, whole', async () => {
    const median = 'a'.repeat(4128);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(feedWithBody(median)) });

    const [item] = await fetchFeed('https://example.test/feed.xml');

    expect(item.content).toContain(median);
  });

  test('truncates at a named constant and nowhere else, so no literal decides how much of an article is kept', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'sources', 'rss.js'),
      'utf8',
    );

    expect(source).toMatch(/entry\.body\.slice\(0,\s*constants\.articleBodyChars\)/);
    expect(source).not.toMatch(/body[^\n]*\.slice\(0,\s*\d/);
  });

  test('gives the same entry the same id on every run, so it is stored once', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(FEED) });

    const [first] = await fetchFeed('https://example.test/feed.xml');
    const [second] = await fetchFeed('https://example.test/feed.xml');

    expect(first.id).toBe(second.id);
  });

  test('rejects when the feed answers with an error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(fetchFeed('https://example.test/missing.xml')).rejects.toThrow(/404/);
  });

  test('returns nothing when the body is not a feed', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<html>hello</html>') });

    await expect(fetchFeed('https://example.test/page.html')).resolves.toEqual([]);
  });
});
