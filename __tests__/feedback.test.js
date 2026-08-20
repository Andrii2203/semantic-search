'use strict';

jest.mock('../src/scheduler');
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}));

const db = require('../src/db');
const searchEngine = require('../src/search-engine');
const scheduler = require('../src/scheduler');
const { applyFeedback } = require('../src/feedback');

// Build a deterministic unit vector (no embedding model needed)
function vec(values) {
  const v = new Float32Array(384);
  values.forEach(([i, val]) => { v[i] = val; });
  return v;
}

function setupUserWithProfile(profileVector) {
  db.createUser({ id: 'u-1', email: 'fb@x.com', passwordHash: 'h' });
  db.saveProfileForUser('u-1', {
    keywords: ['rust'],
    rawInput: 'rust async',
    vector: searchEngine.serializeVector(profileVector),
  });
}

function insertItemWithVector(itemVector) {
  const constants = require('../src/search-constants');
  db.insertItem({ id: 'it-1', content: 'Some post about systems programming', type: 'post', source: 'hn', metadata: {} });
  db.insertChunk({
    id: 'it-1_0', parentId: 'it-1', content: 'Some post about systems programming',
    chunkIndex: 0, strategy: 'fixed', vector: searchEngine.serializeVector(itemVector), metadata: {},
    model: constants.embeddingModel, dimensions: itemVector.length,
  });
}

function profileCosineTo(target) {
  const profile = db.getProfileByUserId('u-1');
  const current = searchEngine.deserializeVector(profile.vector);
  return searchEngine.cosineSimilarity(current, target);
}

describe('Feedback loop — profile vector blending', () => {
  beforeEach(() => {
    db.init(':memory:');
    jest.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  test('star shifts profile vector toward the item vector', async () => {
    const profileVec = vec([[0, 1]]);
    const itemVec = vec([[1, 1]]);
    setupUserWithProfile(profileVec);
    insertItemWithVector(itemVec);

    const before = profileCosineTo(itemVec);
    const ok = await applyFeedback('u-1', db.getItemById('it-1'), 'star');
    const after = profileCosineTo(itemVec);

    expect(ok).toBe(true);
    expect(after).toBeGreaterThan(before);
    expect(scheduler.invalidateProfileCache).toHaveBeenCalledWith('u-1');
  });

  test('skip shifts profile vector away from the item vector', async () => {
    const profileVec = vec([[0, 1], [1, 0.3]]);
    const itemVec = vec([[1, 1]]);
    setupUserWithProfile(profileVec);
    insertItemWithVector(itemVec);

    const before = profileCosineTo(itemVec);
    const ok = await applyFeedback('u-1', db.getItemById('it-1'), 'skip');
    const after = profileCosineTo(itemVec);

    expect(ok).toBe(true);
    expect(after).toBeLessThan(before);
  });

  test('approve uses a smaller positive weight than star', async () => {
    const profileVec = vec([[0, 1]]);
    const itemVec = vec([[1, 1]]);

    setupUserWithProfile(profileVec);
    insertItemWithVector(itemVec);
    await applyFeedback('u-1', db.getItemById('it-1'), 'approve');
    const afterApprove = profileCosineTo(itemVec);

    db.close();
    db.init(':memory:');
    setupUserWithProfile(profileVec);
    insertItemWithVector(itemVec);
    await applyFeedback('u-1', db.getItemById('it-1'), 'star');
    const afterStar = profileCosineTo(itemVec);

    expect(afterStar).toBeGreaterThan(afterApprove);
  });

  test('returns false when user has no profile vector', async () => {
    db.createUser({ id: 'u-1', email: 'fb@x.com', passwordHash: 'h' });
    insertItemWithVector(vec([[1, 1]]));

    const ok = await applyFeedback('u-1', db.getItemById('it-1'), 'star');
    expect(ok).toBe(false);
    expect(scheduler.invalidateProfileCache).not.toHaveBeenCalled();
  });

  test('returns false for unknown action', async () => {
    setupUserWithProfile(vec([[0, 1]]));
    insertItemWithVector(vec([[1, 1]]));

    const ok = await applyFeedback('u-1', db.getItemById('it-1'), 'open');
    expect(ok).toBe(false);
  });

  test('leaves the profile unchanged when the item was embedded by another model', async () => {
    const constants = require('../src/search-constants');
    setupUserWithProfile(vec([[0, 1]]));
    db.getDb().prepare('UPDATE profiles SET model = ?, dimensions = 384').run(constants.embeddingModel);
    insertItemWithVector(vec([[1, 1]]));
    db.getDb()
      .prepare('UPDATE chunks SET model = ?, dimensions = 384')
      .run('a-model-this-product-no-longer-runs');

    const before = db.getProfileByUserId('u-1').vector;
    const ok = await applyFeedback('u-1', db.getItemById('it-1'), 'star');

    expect(ok).toBe(false);
    expect(db.getProfileByUserId('u-1').vector).toEqual(before);
  });

  test('names the model of the profile and the model of the item when it refuses', async () => {
    const logger = require('../src/logger');
    const constants = require('../src/search-constants');
    setupUserWithProfile(vec([[0, 1]]));
    db.getDb().prepare('UPDATE profiles SET model = ?, dimensions = 384').run(constants.embeddingModel);
    insertItemWithVector(vec([[1, 1]]));
    db.getDb()
      .prepare('UPDATE chunks SET model = ?, dimensions = 384')
      .run('a-model-this-product-no-longer-runs');

    await applyFeedback('u-1', db.getItemById('it-1'), 'star');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        profileModel: constants.embeddingModel,
        itemModel: 'a-model-this-product-no-longer-runs',
      }),
      expect.any(String),
    );
  });

  test('profile vector stays normalized after blending', async () => {
    setupUserWithProfile(vec([[0, 1]]));
    insertItemWithVector(vec([[1, 1]]));

    await applyFeedback('u-1', db.getItemById('it-1'), 'star');

    const profile = db.getProfileByUserId('u-1');
    const current = searchEngine.deserializeVector(profile.vector);
    let norm = 0;
    for (let i = 0; i < current.length; i++) {norm += current[i] * current[i];}
    expect(Math.sqrt(norm)).toBeCloseTo(1.0, 5);
  });
});
