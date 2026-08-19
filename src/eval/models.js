'use strict';

const constants = require('../search-constants');

const MODELS = {
  'Xenova/all-MiniLM-L6-v2': { dimensions: 384, contextTokens: 256, prefixes: null },
  'Xenova/bge-small-en-v1.5': { dimensions: 384, contextTokens: 512, prefixes: null },
  'Xenova/gte-small': { dimensions: 384, contextTokens: 512, prefixes: null },
  'onnx-community/embeddinggemma-300m-ONNX': {
    dimensions: 768,
    contextTokens: 2048,
    batchSize: 16,
    prefixes: { document: 'title: none | text: ', query: 'task: search result | query: ' },
  },
};

function factsFor(model) {
  const facts = MODELS[model];
  if (!facts) {
    throw new Error(`unknown model ${model}. Known models: ${Object.keys(MODELS).join(', ')}`);
  }
  return facts;
}

function coversChunk(model, tokensPerWord) {
  return factsFor(model).contextTokens >= constants.chunkMaxWords * tokensPerWord;
}

function batchFor(model) {
  return factsFor(model).batchSize || constants.embeddingBatchSize;
}

function truncateVector(vector, dimensions) {
  if (!dimensions || dimensions >= vector.length) {
    return vector;
  }

  const cut = Array.from(vector).slice(0, dimensions);
  const length = Math.hypot(...cut);

  return length === 0 ? cut : cut.map((value) => value / length);
}

function withPrefix(text, side, model) {
  const { prefixes } = factsFor(model);
  return prefixes ? `${prefixes[side]}${text}` : text;
}

function slugFor(model) {
  return model.replace(/\W/g, '-');
}

module.exports = {
  MODELS, batchFor, factsFor, coversChunk, truncateVector, withPrefix, slugFor,
};
