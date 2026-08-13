'use strict';

const { isKeywordStuffed } = require('../src/junk-filter');
const { ITEMS } = require('../src/seed-dataset');

const REAL_ARTICLE =
  'A deep comparison of async Rust runtimes. tokio and async-std both provide async await ' +
  'executors; we benchmark task scheduling, latency and throughput in production Rust services.';

const STUFFED =
  'RUST ASYNC TOKIO best rust async tutorial 2026 rust async\n\n' +
  'rust async tokio rust async await futures rust concurrency best rust async guide 2026 ' +
  'click here rust async tokio rust async tutorial cheap rust course buy now rust async.';

describe('src/junk-filter.js', () => {
  describe('isKeywordStuffed', () => {
    test('reports text whose words are mostly repeats', () => {
      expect(isKeywordStuffed(STUFFED)).toBe(true);
    });

    test('leaves an ordinary article alone', () => {
      expect(isKeywordStuffed(REAL_ARTICLE)).toBe(false);
    });

    test('does not judge text too short to judge', () => {
      expect(isKeywordStuffed('rust async rust async rust async')).toBe(false);
    });

    test('handles empty and missing input', () => {
      expect(isKeywordStuffed('')).toBe(false);
      expect(isKeywordStuffed(null)).toBe(false);
    });
  });

  describe('against the labelled dataset', () => {
    const textOf = (item) => `${item.title}\n\n${item.content}`;

    test('keeps every item labelled relevant', () => {
      const relevant = ITEMS.filter((item) =>
        ['exact', 'semantic', 'duplicate'].includes(item.group),
      );

      const dropped = relevant.filter((item) => isKeywordStuffed(textOf(item)));

      expect(dropped.map((item) => item.title)).toEqual([]);
    });

    test('keeps every item labelled partial or trap, which are wrong but not junk', () => {
      const notJunk = ITEMS.filter((item) => ['partial', 'trap'].includes(item.group));

      const dropped = notJunk.filter((item) => isKeywordStuffed(textOf(item)));

      expect(dropped.map((item) => item.title)).toEqual([]);
    });

    test('drops every item labelled spam', () => {
      const spam = ITEMS.filter((item) => item.group === 'spam');

      const kept = spam.filter((item) => !isKeywordStuffed(textOf(item)));

      expect(kept.map((item) => item.title)).toEqual([]);
    });
  });
});
