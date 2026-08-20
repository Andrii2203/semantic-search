'use strict';

const fs = require('fs');
const path = require('path');

const constants = require('../src/search-constants');
const {
  MODELS, batchFor, factsFor, coversChunk, truncateVector, withPrefix,
} = require('../src/models');

const MINILM = 'Xenova/all-MiniLM-L6-v2';
const GEMMA = 'onnx-community/embeddinggemma-300m-ONNX';

function sourceOf(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', ...segments), 'utf-8');
}

describe('src/models.js', () => {
  test('a model that requires instruction prefixes produces a different string for a document than for a query, and a model that requires none receives the text unchanged', () => {
    const text = 'sediment transport along the northern shore';

    expect(withPrefix(text, 'document', GEMMA)).not.toBe(withPrefix(text, 'query', GEMMA));
    expect(withPrefix(text, 'document', GEMMA)).toContain(text);
    expect(withPrefix(text, 'query', GEMMA)).toContain(text);

    expect(withPrefix(text, 'document', MINILM)).toBe(text);
    expect(withPrefix(text, 'query', MINILM)).toBe(text);
  });

  test('every candidate carries its dimensions and its context window in one table, and that table says whether the window covers chunkMaxWords at a given tokens per word', () => {
    for (const [name, facts] of Object.entries(MODELS)) {
      expect(typeof facts.dimensions).toBe('number');
      expect(typeof facts.contextTokens).toBe('number');
      expect(name).toMatch(/\//);
    }

    expect(coversChunk(MINILM, constants.tokensPerWord)).toBe(false);
    expect(coversChunk('Xenova/bge-small-en-v1.5', constants.tokensPerWord)).toBe(true);
    expect(coversChunk(GEMMA, constants.tokensPerWord)).toBe(true);
  });

  test('the batch the embedder sends comes from the model own facts, and a model that declares none is embedded at embeddingBatchSize', () => {
    expect(batchFor(GEMMA)).toBe(16);
    expect(batchFor(MINILM)).toBe(constants.embeddingBatchSize);
    expect(batchFor('Xenova/bge-small-en-v1.5')).toBe(constants.embeddingBatchSize);
    expect(batchFor(GEMMA)).toBeLessThan(batchFor(MINILM));
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
    expect(() => factsFor('Xenova/not-a-model')).toThrow(new RegExp(MINILM));
  });

  test('is the module src/search-engine.js, src/eval/harness.js and src/eval/embedder.js read model facts from', () => {
    expect(sourceOf('search-engine.js')).toContain("require('./models')");
    expect(sourceOf('eval', 'harness.js')).toContain("require('../models')");
    expect(sourceOf('eval', 'embedder.js')).toContain("require('../models')");
  });

  test('src/eval/models.js no longer exists, so model facts have one origin', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'src', 'eval', 'models.js'))).toBe(false);
  });
});
