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
        'generateEmbeddings',
        'groupByParent',
        'mergeResults',
        'mmrSelect',
        'rrfMerge',
        'scoreChunksByVector',
        'serializeVector',
      ]);
    });
  });

  test('search-engine.js imports no project module other than search-constants and models (isolation check)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'search-engine.js'), 'utf-8');
    const projectImports = source
      .split('\n')
      .filter((line) => line.includes(`require('./`) || line.includes(`require('../`))
      .filter((line) => !line.includes(`require('./search-constants')`))
      .filter((line) => !line.includes(`require('./models')`));
    expect(projectImports).toHaveLength(0);
  });
});

describe('src/search-engine.js embedding path', () => {
  const constants = require('../src/search-constants');

  let realEngine;
  jest.isolateModules(() => {
    realEngine = require('../src/search-engine');
  });

  function encoderReturning(width) {
    const calls = [];
    const encode = jest.fn(async (texts, side) => {
      calls.push({ texts, side });
      return texts.map(() => new Array(width).fill(1 / Math.sqrt(width)));
    });
    return { encode, calls };
  }

  test('embeds with the model named by embeddingModel and contains no model identifier of its own', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'search-engine.js'), 'utf-8');

    expect(source).not.toMatch(/Xenova\//);
    expect(source).not.toMatch(/onnx-community\//);
    expect(source).toContain('constants.embeddingModel');
  });

  test('sends a document under the document prefix of the active model and a query under its query prefix, so one text never reaches the encoder as the same string on both sides', async () => {
    const { encode, calls } = encoderReturning(constants.embeddingDimensions);

    await realEngine.generateEmbedding('a paragraph of text', 'document', { encode });
    await realEngine.generateEmbedding('a paragraph of text', 'query', { encode });

    expect(calls[0].texts[0]).not.toBe(calls[1].texts[0]);
    expect(calls[0].texts[0].endsWith('a paragraph of text')).toBe(true);
    expect(calls[1].texts[0].endsWith('a paragraph of text')).toBe(true);
  });

  test('embeds as a query when the caller names no side', async () => {
    const { encode, calls } = encoderReturning(constants.embeddingDimensions);

    await realEngine.generateEmbedding('a paragraph of text', undefined, { encode });
    await realEngine.generateEmbedding('a paragraph of text', 'query', { encode });

    expect(calls[0].texts[0]).toBe(calls[1].texts[0]);
  });

  test('returns embeddingDimensions values, renormalised, when the model is wider than that', async () => {
    const wide = 2 * constants.embeddingDimensions;
    const { encode } = encoderReturning(wide);

    const vector = await realEngine.generateEmbedding('a paragraph of text', 'document', { encode });
    const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

    expect(vector).toHaveLength(constants.embeddingDimensions);
    expect(magnitude).toBeCloseTo(1, 6);
  });

  test('returns the width of the model when the model is no wider than embeddingDimensions', async () => {
    const { encode } = encoderReturning(constants.embeddingDimensions);

    const vector = await realEngine.generateEmbedding('a paragraph of text', 'document', { encode });

    expect(vector).toHaveLength(constants.embeddingDimensions);
    expect(vector[0]).toBeCloseTo(1 / Math.sqrt(constants.embeddingDimensions), 6);
  });
});
