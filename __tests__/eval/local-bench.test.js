'use strict';

const { loadLocalDataset } = require('../../src/eval/local-bench');

describe('src/eval/local-bench.js', () => {
  test('the local corpus loads in the shape a public collection loads in', () => {
    const dataset = loadLocalDataset();

    expect(dataset.name).toBe('local-news');
    expect(dataset.documents.length).toBeGreaterThan(100);
    expect(Object.keys(dataset.documents[0]).sort()).toEqual(['id', 'text', 'title']);
    expect(Object.keys(dataset.queries[0]).sort()).toEqual(['id', 'text']);
    expect(dataset.qrels instanceof Map).toBe(true);

    for (const query of dataset.queries) {
      expect(dataset.qrels.has(query.id)).toBe(true);
    }
  });

  test('the local dataset carries only the intents of the requested split, and defaults to dev', () => {
    const dev = loadLocalDataset();
    const locked = loadLocalDataset({ split: 'locked' });

    expect(dev.split).toBe('dev');
    expect(dev.queries.length).toBeGreaterThan(0);
    expect(locked.queries.length).toBeGreaterThan(0);

    const devIds = new Set(dev.queries.map((query) => query.id));
    for (const query of locked.queries) {
      expect(devIds.has(query.id)).toBe(false);
    }
  });

  test('the local dataset reports how many of its intents have no relevant article', () => {
    const dataset = loadLocalDataset();

    expect(dataset.unanswerable).toBeGreaterThan(0);
    expect(dataset.answerable).toBe(dataset.queries.length);
    expect(dataset.judgedIntents).toBe(dataset.answerable + dataset.unanswerable);
  });

  test('every judged article of a kept intent exists in the corpus', () => {
    const dataset = loadLocalDataset();
    const ids = new Set(dataset.documents.map((document) => document.id));

    for (const judgments of dataset.qrels.values()) {
      for (const articleId of judgments.keys()) {
        expect(ids.has(articleId)).toBe(true);
      }
    }
  });

  test('an intent kept in the dataset has at least one article graded relevant', () => {
    const dataset = loadLocalDataset();

    for (const query of dataset.queries) {
      const grades = [...dataset.qrels.get(query.id).values()];
      expect(Math.max(...grades)).toBeGreaterThanOrEqual(2);
    }
  });
});
