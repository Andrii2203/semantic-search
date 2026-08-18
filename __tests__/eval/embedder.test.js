'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { cacheFile, loadVectors, saveVectors } = require('../../src/eval/embedder');

const TITLE_AND_TEXT = ['title', 'text'];
const TEXT_ONLY = ['text'];

const ids = ['a', 'b'];
const vectors = [
  [0.1, 0.2, 0.3],
  [0.4, 0.5, 0.6],
];

describe('src/eval/embedder.js, the vector cache', () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'embedder-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('the vector cache file name contains the field set the configuration indexes', () => {
    expect(path.basename(cacheFile(directory, TITLE_AND_TEXT))).toContain('title-text');
    expect(path.basename(cacheFile(directory, TEXT_ONLY))).toContain('text');
    expect(cacheFile(directory, TITLE_AND_TEXT)).not.toBe(cacheFile(directory, TEXT_ONLY));
  });

  test('two configurations that index different field sets never read each other vectors', () => {
    saveVectors(directory, ids, vectors, TITLE_AND_TEXT);

    expect(loadVectors(directory, ids, TEXT_ONLY)).toBeNull();
  });

  test('two configurations that index the same field set share one cache file', () => {
    saveVectors(directory, ids, vectors, TITLE_AND_TEXT);
    const loaded = loadVectors(directory, ids, TITLE_AND_TEXT);

    expect([...loaded.keys()]).toEqual(ids);
    expect(Array.from(loaded.get('a'))).toEqual(vectors[0].map((value) => Math.fround(value)));
    expect(fs.readdirSync(directory)).toHaveLength(1);
  });
});
