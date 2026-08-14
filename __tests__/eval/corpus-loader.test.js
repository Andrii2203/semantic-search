'use strict';

const { loadCorpus, loadIntents, loadPosts } = require('../../src/eval/corpus-loader');

describe('src/eval/corpus-loader.js', () => {
  test('the loader reads a snapshot from disk and performs no network request', () => {
    const realFetch = global.fetch;
    const calls = [];
    global.fetch = (...args) => {
      calls.push(args);
      return Promise.reject(new Error('the evaluation snapshot must not reach the network'));
    };

    try {
      expect(loadCorpus().length).toBeGreaterThan(0);
      expect(loadPosts().length).toBeGreaterThan(0);
      expect(calls).toHaveLength(0);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('two loads of the same snapshot produce items in the same order', () => {
    const first = loadCorpus().map((article) => article.id);
    const second = loadCorpus().map((article) => article.id);
    expect(second).toEqual(first);
  });

  test('every article carries the fields the ingest path expects', () => {
    for (const article of loadCorpus()) {
      expect(typeof article.id).toBe('string');
      expect(article.content.length).toBeGreaterThan(0);
      expect(typeof article.source).toBe('string');
      expect(typeof article.fetchedAt).toBe('string');
    }
  });

  test('every intent carries an identifier and free text', () => {
    const intents = loadIntents();
    expect(intents.length).toBeGreaterThan(0);
    for (const intent of intents) {
      expect(typeof intent.id).toBe('string');
      expect(intent.content.trim().length).toBeGreaterThan(0);
    }
  });

  test('every intent is a post that exists in a snapshot, not invented text', () => {
    const postIds = new Set(loadPosts().map((post) => post.id));
    for (const intent of loadIntents()) {
      expect(postIds.has(intent.id)).toBe(true);
    }
  });
});
