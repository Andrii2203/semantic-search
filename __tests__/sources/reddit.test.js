'use strict';

jest.mock('../../src/retry', () => ({
  retry: jest.fn((fn) => fn()),
}));

const reddit = require('../../src/sources/reddit');

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

// Minimal Atom feed that Reddit actually returns
const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <author><name>/u/testuser</name></author>
    <category term="programming" label="r/programming"/>
    <content type="html">&lt;p&gt;Post body text here&lt;/p&gt;</content>
    <id>t3_abc123</id>
    <link href="https://www.reddit.com/r/programming/comments/abc123/test_post/"/>
    <updated>2024-01-15T10:00:00+00:00</updated>
    <title>Test Reddit Post</title>
  </entry>
  <entry>
    <author><name>/u/other</name></author>
    <category term="programming" label="r/programming"/>
    <content type="html"></content>
    <id>t3_def456</id>
    <link href="https://www.reddit.com/r/programming/comments/def456/another_post/"/>
    <updated>2024-01-15T09:00:00+00:00</updated>
    <title>Another Post</title>
  </entry>
</feed>`;

describe('Reddit Source — RSS', () => {
  beforeEach(() => jest.clearAllMocks());

  test('fetch: parses Atom RSS feed and returns IR items', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(ATOM_FEED) });

    const items = await reddit.fetch({ limit: 10 });

    expect(items).toHaveLength(2);
    expect(items[0].metadata.title).toBe('Test Reddit Post');
    expect(items[0].source).toBe('reddit');
    expect(items[0].type).toBe('post');
    expect(items[0].content).toContain('Test Reddit Post');
    expect(items[0].metadata.author).toBe('testuser');
    expect(items[0].metadata.url).toContain('reddit.com');
  });

  test('fetch: strips HTML from content field', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(ATOM_FEED) });

    const items = await reddit.fetch();

    // Content should not contain raw HTML tags
    expect(items[0].content).not.toMatch(/<[^>]+>/);
    expect(items[0].content).toContain('Post body text here');
  });

  test('fetch: uses RSS URL, not JSON endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(ATOM_FEED) });

    await reddit.fetch({ limit: 5 });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/\.rss/);
    expect(calledUrl).not.toMatch(/\.json/);
  });

  test('fetch: returns empty array on HTTP error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const items = await reddit.fetch();
    expect(items).toEqual([]);
  });

  test('fetch: returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const items = await reddit.fetch();
    expect(items).toEqual([]);
  });

  test('fetch: filters entries with missing title or link', async () => {
    const badFeed = `<feed>
      <entry>
        <id>t3_nolink</id>
        <title>Has title no link</title>
      </entry>
      <entry>
        <id>t3_notitle</id>
        <link href="https://www.reddit.com/r/test/comments/notitle/"/>
      </entry>
    </feed>`;
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(badFeed) });

    const items = await reddit.fetch();
    expect(items).toHaveLength(0);
  });

  test('fetch: calls correct multireddit RSS URL with subreddits joined by +', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(ATOM_FEED) });

    await reddit.fetch({ limit: 25 });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/\/r\/.+\+.+\/hot\.rss/);
    expect(calledUrl).toContain('limit=25');
  });
});
