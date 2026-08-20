'use strict';

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}));

const db = require('../../src/db');
const searchEngine = require('../../src/search-engine');
const constants = require('../../src/search-constants');
const { reindex } = require('../../scripts/reindex-embeddings');

const PREVIOUS_MODEL = 'a-model-this-product-no-longer-runs';

function vectorOf(value) {
  return searchEngine.serializeVector(new Array(constants.embeddingDimensions).fill(value));
}

function encoderReturning(value) {
  const sides = [];
  const encode = jest.fn(async (texts, side) => {
    sides.push(side);
    return texts.map(() => new Array(constants.embeddingDimensions).fill(value));
  });
  return { encode, sides };
}

function storeItemWithChunks(count, model) {
  db.insertItem({
    id: 'item-1',
    content: 'A stored article about consensus protocols',
    type: 'post',
    source: 'mock-source',
    metadata: { title: 'Consensus' },
    collectionId: 'internet',
  });

  db.insertChunksBatch(
    Array.from({ length: count }, (_, index) => ({
      id: `item-1_${index}`,
      parentId: 'item-1',
      content: `Chunk ${index} of a stored article about consensus protocols`,
      chunkIndex: index,
      strategy: 'fixed',
      vector: vectorOf(0.1),
      metadata: {},
      model,
      dimensions: constants.embeddingDimensions,
    })),
  );
}

function storeProfile(model, rawInput) {
  db.createUser({ id: 'u-1', email: 'reindex@example.com', passwordHash: 'hash' });
  db.saveProfileForUser('u-1', {
    keywords: ['consensus'],
    rawInput,
    vector: vectorOf(0.1),
    model,
    dimensions: constants.embeddingDimensions,
  });
}

beforeEach(() => {
  db.init(':memory:');
  jest.clearAllMocks();
});

afterEach(() => {
  db.close();
});

describe('scripts/reindex-embeddings.js', () => {
  test('re-embeds every chunk whose stored model is not the active one', async () => {
    storeItemWithChunks(3, PREVIOUS_MODEL);
    const { encode } = encoderReturning(0.5);

    const report = await reindex({ encode, batchSize: 2 });

    expect(report.chunks).toBe(3);
    for (const chunk of db.getChunksByParent('item-1')) {
      expect(chunk.model).toBe(constants.embeddingModel);
      expect(chunk.dimensions).toBe(constants.embeddingDimensions);
      expect(searchEngine.deserializeVector(chunk.vector)[0]).toBeCloseTo(0.5, 5);
    }
  });

  test('embeds a chunk as a document and a profile as a query', async () => {
    storeItemWithChunks(1, PREVIOUS_MODEL);
    storeProfile(PREVIOUS_MODEL, 'consensus protocols in practice');
    const encode = async (texts, side) =>
      texts.map(() => new Array(constants.embeddingDimensions).fill(side === 'query' ? 0.9 : 0.1));

    await reindex({ encode, batchSize: 2 });

    const chunk = db.getChunksByParent('item-1')[0];
    const profile = db.getProfileByUserId('u-1');
    expect(searchEngine.deserializeVector(chunk.vector)[0]).toBeCloseTo(0.1, 5);
    expect(searchEngine.deserializeVector(profile.vector)[0]).toBeCloseTo(0.9, 5);
  });

  test('re-embeds a profile whose stored model is not the active one', async () => {
    storeProfile(PREVIOUS_MODEL, 'consensus protocols in practice');
    const { encode } = encoderReturning(0.5);

    const report = await reindex({ encode, batchSize: 2 });

    const profile = db.getProfileByUserId('u-1');
    expect(report.profiles).toBe(1);
    expect(profile.model).toBe(constants.embeddingModel);
    expect(searchEngine.deserializeVector(profile.vector)[0]).toBeCloseTo(0.5, 5);
  });

  test('leaves a profile that stored no text of its own untouched, and reports it', async () => {
    storeProfile(PREVIOUS_MODEL, null);
    const { encode } = encoderReturning(0.5);

    const report = await reindex({ encode, batchSize: 2 });

    expect(report.profilesWithoutText).toBe(1);
    expect(db.getProfileByUserId('u-1').model).toBe(PREVIOUS_MODEL);
  });

  test('re-embeds nothing on a second run', async () => {
    storeItemWithChunks(3, PREVIOUS_MODEL);
    storeProfile(PREVIOUS_MODEL, 'consensus protocols in practice');
    const first = encoderReturning(0.5);
    await reindex({ encode: first.encode, batchSize: 2 });

    const second = encoderReturning(0.7);
    const report = await reindex({ encode: second.encode, batchSize: 2 });

    const chunk = db.getChunksByParent('item-1')[0];
    expect(searchEngine.deserializeVector(chunk.vector)[0]).toBeCloseTo(0.5, 5);
    expect(report.chunks).toBe(0);
    expect(report.profiles).toBe(0);
  });

  test('keeps the batches it finished when a later batch fails', async () => {
    storeItemWithChunks(4, PREVIOUS_MODEL);
    let batch = 0;
    const encode = jest.fn(async (texts) => {
      batch += 1;
      if (batch > 1) {
        throw new Error('the encoder died');
      }
      return texts.map(() => new Array(constants.embeddingDimensions).fill(0.5));
    });

    await expect(reindex({ encode, batchSize: 2 })).rejects.toThrow('the encoder died');

    const reindexed = db
      .getChunksByParent('item-1')
      .filter((chunk) => chunk.model === constants.embeddingModel);
    expect(reindexed).toHaveLength(2);
  });

  test('reports its progress as it goes, so a long run can be told from a stalled one', async () => {
    storeItemWithChunks(4, PREVIOUS_MODEL);
    const { encode } = encoderReturning(0.5);
    const progress = [];

    await reindex({ encode, batchSize: 2, onProgress: (done, total) => progress.push([done, total]) });

    expect(progress.length).toBeGreaterThan(1);
    expect(progress[progress.length - 1][0]).toBe(progress[progress.length - 1][1]);
  });
});
