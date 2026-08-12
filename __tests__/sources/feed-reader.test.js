'use strict';

const { readFeed } = require('../../src/sources/feed-reader');

const RSS_2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example blog</title>
    <item>
      <title>Rust in production</title>
      <link>https://example.test/rust</link>
      <description><![CDATA[<p>Why we moved to <b>Rust</b> and what it cost.</p>]]></description>
      <author>ada@example.test</author>
      <pubDate>Tue, 12 Aug 2026 10:00:00 GMT</pubDate>
      <guid>https://example.test/rust</guid>
    </item>
    <item>
      <title>Postgres tuning</title>
      <link>https://example.test/postgres</link>
      <description>Indexes &amp; vacuum, the parts that matter.</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example notes</title>
  <entry>
    <id>tag:example.test,2026:1</id>
    <title>Chunking strategies</title>
    <link href="https://example.test/chunking"/>
    <content type="html">&lt;p&gt;Fixed, semantic and hierarchical.&lt;/p&gt;</content>
    <author><name>Grace</name></author>
    <updated>2026-08-12T10:00:00Z</updated>
  </entry>
</feed>`;

describe('src/sources/feed-reader.js', () => {
  describe('readFeed', () => {
    test('reads every item of an RSS 2.0 feed', () => {
      const entries = readFeed(RSS_2);

      expect(entries).toHaveLength(2);
      expect(entries[0].title).toBe('Rust in production');
      expect(entries[1].title).toBe('Postgres tuning');
    });

    test('returns the link, body, author and published time of an RSS item', () => {
      const [entry] = readFeed(RSS_2);

      expect(entry.link).toBe('https://example.test/rust');
      expect(entry.body).toContain('Why we moved to Rust');
      expect(entry.author).toBe('ada@example.test');
      expect(entry.publishedAt).toContain('2026');
    });

    test('strips markup and decodes entities in the body', () => {
      const entries = readFeed(RSS_2);

      expect(entries[0].body).not.toContain('<p>');
      expect(entries[1].body).toBe('Indexes & vacuum, the parts that matter.');
    });

    test('reads an Atom feed, where the link is an attribute', () => {
      const [entry] = readFeed(ATOM);

      expect(entry.title).toBe('Chunking strategies');
      expect(entry.link).toBe('https://example.test/chunking');
      expect(entry.author).toBe('Grace');
      expect(entry.body).toContain('Fixed, semantic and hierarchical');
    });

    test('returns an empty list for a body that is not a feed', () => {
      expect(readFeed('<html><body>not a feed</body></html>')).toEqual([]);
      expect(readFeed('')).toEqual([]);
      expect(readFeed(null)).toEqual([]);
    });

    test('skips entries that carry no title or no link', () => {
      const broken = `<rss><channel>
        <item><title>No link here</title></item>
        <item><link>https://example.test/no-title</link></item>
        <item><title>Complete</title><link>https://example.test/ok</link></item>
      </channel></rss>`;

      const entries = readFeed(broken);

      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Complete');
    });
  });
});
