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

  describe('findRelevant', () => {
    const makeItem = (id, content) => ({ id, content, type: 'post', source: 'test' });

    test('returns only items with score >= threshold', async () => {
      const items = [
        makeItem('1', 'JavaScript framework comparison'),
        makeItem('2', 'Cooking recipe for pasta'),
        makeItem('3', 'Node.js microservices architecture'),
      ];
      const profileVector = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      
      const results = await searchEngine.findRelevant(items, profileVector, 0.5);
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
         expect(r.score).toBeGreaterThanOrEqual(0.5);
      }
    });

    test('returns empty array for empty input', async () => {
      const results = await searchEngine.findRelevant([], [1, 0], 0.5);
      expect(results).toEqual([]);
    });

    test('threshold 0 returns all items sorted', async () => {
      const items = [makeItem('1', 'a'), makeItem('2', 'b')];
      const profileVector = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      
      const results = await searchEngine.findRelevant(items, profileVector, 0);
      expect(results).toHaveLength(2);
      expect(results[0].score).toBeDefined();
    });

    test('calls mocked generateEmbedding', async () => {
      const items = [makeItem('1', 'Test content')];
      await searchEngine.findRelevant(items, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 0);
      
      // Переконуємось, що "шпигун" спрацював
      expect(searchEngine.generateEmbedding).toHaveBeenCalledWith('Test content');
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
