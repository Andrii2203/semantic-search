'use strict';

const constants = require('../../src/search-constants');
const {
  MODELS, batchFor, factsFor, coversChunk, truncateVector, withPrefix,
} = require('../../src/eval/models');

const BASELINE = constants.embeddingModel;
const GEMMA = 'onnx-community/embeddinggemma-300m-ONNX';

describe('src/eval/models.js', () => {
  test('a model that requires instruction prefixes produces a different string for a document than for a query, and a model that requires none receives the text unchanged', () => {
    const text = 'sediment transport along the northern shore';

    expect(withPrefix(text, 'document', GEMMA)).not.toBe(withPrefix(text, 'query', GEMMA));
    expect(withPrefix(text, 'document', GEMMA)).toContain(text);
    expect(withPrefix(text, 'query', GEMMA)).toContain(text);

    expect(withPrefix(text, 'document', BASELINE)).toBe(text);
    expect(withPrefix(text, 'query', BASELINE)).toBe(text);
  });

  test('every candidate carries its dimensions and its context window in one table, and that table says whether the window covers chunkMaxWords at a given tokens per word', () => {
    for (const [name, facts] of Object.entries(MODELS)) {
      expect(typeof facts.dimensions).toBe('number');
      expect(typeof facts.contextTokens).toBe('number');
      expect(name).toMatch(/\//);
    }

    expect(coversChunk(BASELINE, constants.tokensPerWord)).toBe(false);
    expect(coversChunk('Xenova/bge-small-en-v1.5', constants.tokensPerWord)).toBe(true);
    expect(coversChunk(GEMMA, constants.tokensPerWord)).toBe(true);
  });

  test('the batch the embedder sends comes from the model own facts, and a model that declares none is embedded at embeddingBatchSize', () => {
    expect(batchFor(GEMMA)).toBe(16);
    expect(batchFor(BASELINE)).toBe(constants.embeddingBatchSize);
    expect(batchFor('Xenova/bge-small-en-v1.5')).toBe(constants.embeddingBatchSize);
    expect(batchFor(GEMMA)).toBeLessThan(batchFor(BASELINE));
  });

  test('a vector truncated to a shorter width keeps its first values and is renormalised to unit length, and a width at or above the model own leaves the vector untouched', () => {
    const vector = [0.6, 0.8, 3, 4];

    const cut = truncateVector(vector, 2);
    expect(cut).toHaveLength(2);
    expect(cut[0]).toBeCloseTo(0.6, 10);
    expect(cut[1]).toBeCloseTo(0.8, 10);
    expect(Math.hypot(...cut)).toBeCloseTo(1, 10);

    expect(truncateVector(vector, 4)).toBe(vector);
    expect(truncateVector(vector, 8)).toBe(vector);
    expect(truncateVector(vector, null)).toBe(vector);
  });

  test('the model facts lookup refuses a model it has no facts for, and names the models it knows', () => {
    expect(() => factsFor('Xenova/not-a-model')).toThrow(/not-a-model/);
    expect(() => factsFor('Xenova/not-a-model')).toThrow(new RegExp(BASELINE));
  });
});
