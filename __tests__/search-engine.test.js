'use strict';

const searchEngine = require('../src/search-engine');
const fs = require('fs');
const path = require('path');

// Шпигуємо за generateEmbedding і заміняємо реальну модель на просту математику
jest.spyOn(searchEngine, 'generateEmbedding').mockImplementation(async (text) => {
  const vec = new Array(6).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % vec.length] += text.charCodeAt(i) / 1000;
  }
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => (mag > 0 ? v / mag : 0));
});

describe('SearchEngine Module', () => {

  // Очистка моків перед кожним тестом
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cosineSimilarity', () => {
    test('identical vectors return 1.0', () => {
      expect(searchEngine.cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0);
    });

    test('orthogonal vectors return 0.0', () => {
      expect(searchEngine.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
    });

    test('opposite vectors return -1.0', () => {
      expect(searchEngine.cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
    });

    test('returns 0 for mismatched lengths', () => {
      expect(searchEngine.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    test('returns 0 for zero vectors', () => {
      expect(searchEngine.cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });
  });

  describe('public api', () => {
    test('exports exactly the documented surface', () => {
      expect(Object.keys(searchEngine).sort()).toEqual([
        'cosineSimilarity',
        'deserializeVector',
        'generateEmbedding',
        'groupByParent',
        'mergeResults',
        'mmrSelect',
        'rrfMerge',
        'scoreChunksByVector',
        'serializeVector',
      ]);
    });
  });

  test('search-engine.js does not import any project modules (isolation check)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'search-engine.js'), 'utf-8');
    const projectImports = source
      .split('\n')
      .filter((line) => line.includes(`require('./`) || line.includes(`require('../`));
    expect(projectImports).toHaveLength(0);
  });
});
