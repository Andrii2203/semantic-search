'use strict';

const path = require('path');
const fs = require('fs');
const db = require('../src/db');

// ─── Setup / Teardown ────────────────────────────────────────

beforeEach(() => {
  db.init(':memory:');
});

afterEach(() => {
  db.close();
});

// ─── Helper ──────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    id: 'item-001',
    content: 'Test content about JavaScript',
    type: 'post',
    source: 'hn',
    metadata: { title: 'Test', url: 'https://example.com' },
    ...overrides,
  };
}

// ─── Table Creation & Migrations ─────────────────────────────

describe('Database initialization', () => {
  test('creates items table', () => {
    const tables = db
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='items'")
      .all();
    expect(tables).toHaveLength(1);
  });

  test('creates migrations table', () => {
    const tables = db
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .all();
    expect(tables).toHaveLength(1);
  });

  test('records applied migrations', () => {
    const migrations = db.getDb().prepare('SELECT name FROM migrations').all();
    expect(migrations.length).toBeGreaterThanOrEqual(2);
    expect(migrations.map((m) => m.name)).toContain('001_create_items');
  });

  test('migrations are idempotent (re-init does not crash)', () => {
    // init again on the same in-memory DB shouldn't crash
    expect(() => db.init(':memory:')).not.toThrow();
  });

  test('DB automatically creates data directory for file-based path', () => {
    db.close();
    const nestedPath = path.join(__dirname, 'nested-test-dir', 'sub', 'test.db');
    try {
      db.init(nestedPath);
      expect(fs.existsSync(nestedPath)).toBe(true);
    } finally {
      db.close();
      // Cleanup
      try {
        for (const f of [nestedPath, `${nestedPath}-wal`, `${nestedPath}-shm`]) {
          if (fs.existsSync(f)) { fs.unlinkSync(f); }
        }
        fs.rmdirSync(path.join(__dirname, 'nested-test-dir', 'sub'));
        fs.rmdirSync(path.join(__dirname, 'nested-test-dir'));
      } catch (_e) { /* cleanup best-effort */ }
      // Re-init in-memory for afterEach
      db.init(':memory:');
    }
  });
});

// ─── Insert ──────────────────────────────────────────────────

describe('insertItem', () => {
  test('inserts item successfully', () => {
    const inserted = db.insertItem(makeItem());
    expect(inserted).toBe(true);

    const items = db.getItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('item-001');
    expect(items[0].content).toBe('Test content about JavaScript');
  });

  test('stores metadata as parsed JSON', () => {
    db.insertItem(makeItem());
    const items = db.getItems();
    expect(items[0].metadata).toEqual({ title: 'Test', url: 'https://example.com' });
  });

  test('deduplicates by fingerprint (same content)', () => {
    db.insertItem(makeItem({ id: 'a' }));
    const second = db.insertItem(makeItem({ id: 'b' })); // same content+source+type → same fingerprint
    expect(second).toBe(false);

    const items = db.getItems();
    expect(items).toHaveLength(1);
  });

  test('different content creates different fingerprints', () => {
    db.insertItem(makeItem({ id: 'a', content: 'First content' }));
    db.insertItem(makeItem({ id: 'b', content: 'Second content' }));

    const items = db.getItems();
    expect(items).toHaveLength(2);
  });

  test('default status is "new"', () => {
    db.insertItem(makeItem());
    const items = db.getItems();
    expect(items[0].status).toBe('new');
  });
});

// ─── Batch Insert ────────────────────────────────────────────

describe('insertItemsBatch', () => {
  test('inserts multiple items in a transaction', () => {
    const items = [
      makeItem({ id: '1', content: 'Content A' }),
      makeItem({ id: '2', content: 'Content B' }),
      makeItem({ id: '3', content: 'Content C' }),
    ];
    const count = db.insertItemsBatch(items);
    expect(count).toBe(3);
    expect(db.getItems()).toHaveLength(3);
  });

  test('skips duplicates in batch', () => {
    const items = [
      makeItem({ id: '1', content: 'Same content' }),
      makeItem({ id: '2', content: 'Same content' }), // duplicate fingerprint
    ];
    const count = db.insertItemsBatch(items);
    expect(count).toBe(1);
  });
});

// ─── Select ──────────────────────────────────────────────────

describe('getItems', () => {
  beforeEach(() => {
    db.insertItemsBatch([
      makeItem({ id: '1', content: 'A', status: 'new', source: 'hn', type: 'post' }),
      makeItem({ id: '2', content: 'B', status: 'approved', source: 'reddit', type: 'post' }),
      makeItem({ id: '3', content: 'C', status: 'new', source: 'hn', type: 'job' }),
    ]);
  });

  test('returns all items without filter', () => {
    expect(db.getItems()).toHaveLength(3);
  });

  test('filters by status', () => {
    const items = db.getItems({ status: 'new' });
    expect(items).toHaveLength(2);
  });

  test('filters by source', () => {
    const items = db.getItems({ source: 'reddit' });
    expect(items).toHaveLength(1);
  });

  test('filters by type', () => {
    const items = db.getItems({ type: 'job' });
    expect(items).toHaveLength(1);
  });

  test('respects limit', () => {
    const items = db.getItems({ limit: 2 });
    expect(items).toHaveLength(2);
  });

  test('respects offset', () => {
    const items = db.getItems({ limit: 1, offset: 2 });
    expect(items).toHaveLength(1);
  });

  test('filters by multiple sources (comma separated)', () => {
    const items = db.getItems({ source: 'hn,reddit' });
    expect(items).toHaveLength(3); // 2 hn + 1 reddit з beforeEach
  });

  test('an item stored by a retired source stays readable and searchable', () => {
    db.insertItem(makeItem({ id: 'legacy-1', content: 'A job posting stored before the source was retired', source: 'djinni', type: 'job' }));

    expect(db.getItemById('legacy-1')).not.toBeNull();
    expect(db.getItems({ source: 'djinni' }).map((item) => item.id)).toContain('legacy-1');
    expect(db.getSources()).toContain('djinni');
  });

});

// ─── Get by ID ───────────────────────────────────────────────

describe('getItemById', () => {
  test('returns item when found', () => {
    db.insertItem(makeItem({ id: 'find-me' }));
    const item = db.getItemById('find-me');
    expect(item).not.toBeNull();
    expect(item.id).toBe('find-me');
  });

  test('returns null when not found', () => {
    const item = db.getItemById('nonexistent');
    expect(item).toBeNull();
  });
});

// ─── Update ──────────────────────────────────────────────────

describe('updateItemStatus', () => {
  test('updates status successfully', () => {
    db.insertItem(makeItem({ id: 'upd-1' }));
    const updated = db.updateItemStatus('upd-1', 'approved');
    expect(updated).toBe(true);

    const item = db.getItemById('upd-1');
    expect(item.status).toBe('approved');
  });

  test('returns false for nonexistent item', () => {
    const updated = db.updateItemStatus('nonexistent', 'approved');
    expect(updated).toBe(false);
  });
});

describe('updateItemResponse', () => {
  test('updates response and score', () => {
    db.insertItem(makeItem({ id: 'resp-1' }));
    db.updateItemResponse('resp-1', 'Generated comment text', 0.87);

    const item = db.getItemById('resp-1');
    expect(item.response).toBe('Generated comment text');
    expect(item.score).toBeCloseTo(0.87);
  });
});

// ─── Count ───────────────────────────────────────────────────

describe('getItemCount', () => {
  test('counts all items', () => {
    db.insertItemsBatch([
      makeItem({ id: '1', content: 'A' }),
      makeItem({ id: '2', content: 'B' }),
    ]);
    expect(db.getItemCount()).toBe(2);
  });

  test('counts by status', () => {
    db.insertItem(makeItem({ id: '1', content: 'A' }));
    db.updateItemStatus('1', 'approved');
    db.insertItem(makeItem({ id: '2', content: 'B' }));
    expect(db.getItemCount({ status: 'new' })).toBe(1);
    expect(db.getItemCount({ status: 'approved' })).toBe(1);
  });
});

// ─── Fingerprint ─────────────────────────────────────────────

describe('fingerprint', () => {
  test('same content produces same fingerprint', () => {
    const fp1 = db.fingerprint(makeItem());
    const fp2 = db.fingerprint(makeItem());
    expect(fp1).toBe(fp2);
  });

  test('different content produces different fingerprint', () => {
    const fp1 = db.fingerprint(makeItem({ content: 'A' }));
    const fp2 = db.fingerprint(makeItem({ content: 'B' }));
    expect(fp1).not.toBe(fp2);
  });

  test('returns a 16-character hex string', () => {
    const fp = db.fingerprint(makeItem());
    expect(fp).toMatch(/^[a-f0-9]{16}$/);
  });

  test('getItemById returns undefined for ghost ID', () => {
    const item = db.getItemById('non-existent-uuid');
    expect(item).toBeNull();
  });

  test('updateItemStatus returns false if no rows updated', () => {
    const result = db.updateItemStatus('ghost-id', 'approved');
    expect(result).toBe(false);
  });

});

// ─── Close ───────────────────────────────────────────────────

describe('close', () => {
  test('close + getDb throws', () => {
    db.close();
    expect(() => db.getDb()).toThrow(/not initialized/);
    // Re-init so afterEach doesn't double-close
    db.init(':memory:');
  });
});

describe('src/db.js vector origin', () => {
  const PREVIOUS_MODEL = 'Xenova/all-MiniLM-L6-v2';
  const PREVIOUS_DIMENSIONS = 384;

  function storeChunkAndProfile({ withVector }) {
    db.insertItem(makeItem());
    db.insertChunk({
      id: 'item-001_0',
      parentId: 'item-001',
      content: 'Test content about JavaScript',
      chunkIndex: 0,
      strategy: 'fixed',
      vector: withVector ? Buffer.from(new Float32Array(PREVIOUS_DIMENSIONS).fill(0.1).buffer) : null,
      metadata: {},
    });
    db.createUser({ id: 'u-1', email: 'origin@example.com', passwordHash: 'hash' });
    db.saveProfileForUser('u-1', {
      keywords: ['javascript'],
      rawInput: 'javascript and node',
      vector: withVector ? Buffer.from(new Float32Array(PREVIOUS_DIMENSIONS).fill(0.1).buffer) : null,
    });
    db.getDb().prepare('UPDATE chunks SET model = NULL, dimensions = NULL').run();
    db.getDb().prepare('UPDATE profiles SET model = NULL, dimensions = NULL').run();
  }

  test('the chunks and the profiles table carry the model and the width of every vector they store', () => {
    const chunkColumns = db.getDb().prepare('PRAGMA table_info(chunks)').all().map((row) => row.name);
    const profileColumns = db.getDb().prepare('PRAGMA table_info(profiles)').all().map((row) => row.name);

    expect(chunkColumns).toEqual(expect.arrayContaining(['model', 'dimensions']));
    expect(profileColumns).toEqual(expect.arrayContaining(['model', 'dimensions']));
  });

  test('the backfill of migration 016 gives every stored vector the model it was produced by', () => {
    storeChunkAndProfile({ withVector: true });

    db.backfillVectorOrigin(db.getDb());

    const chunk = db.getChunksByParent('item-001')[0];
    const profile = db.getProfileByUserId('u-1');
    expect(chunk.model).toBe(PREVIOUS_MODEL);
    expect(chunk.dimensions).toBe(PREVIOUS_DIMENSIONS);
    expect(profile.model).toBe(PREVIOUS_MODEL);
    expect(profile.dimensions).toBe(PREVIOUS_DIMENSIONS);
  });

  test('the backfill claims no origin for a row that holds no vector', () => {
    storeChunkAndProfile({ withVector: false });

    db.backfillVectorOrigin(db.getDb());

    expect(db.getChunksByParent('item-001')[0].model).toBeNull();
    expect(db.getProfileByUserId('u-1').model).toBeNull();
  });

  function vectorFilledWith(value) {
    return Buffer.from(new Float32Array(PREVIOUS_DIMENSIONS).fill(value).buffer);
  }

  function storeTwoGenerations() {
    db.insertItem(makeItem({ id: 'net-1', collectionId: 'internet' }));

    db.insertChunk({
      id: 'net-1_0', parentId: 'net-1', content: 'kept', chunkIndex: 0, strategy: 'fixed',
      vector: vectorFilledWith(0.1), metadata: {},
      model: PREVIOUS_MODEL, dimensions: PREVIOUS_DIMENSIONS,
    });
    db.insertChunk({
      id: 'net-1_1', parentId: 'net-1', content: 'excluded', chunkIndex: 1, strategy: 'fixed',
      vector: vectorFilledWith(0.9), metadata: {},
      model: 'a-model-this-product-no-longer-runs', dimensions: PREVIOUS_DIMENSIONS,
    });
  }

  test('getRecentInternetChunkVectors returns the vectors of one named model only', () => {
    storeTwoGenerations();

    const recent = db.getRecentInternetChunkVectors(200, PREVIOUS_MODEL);

    expect(recent).toHaveLength(1);
    expect(recent[0]).toEqual(vectorFilledWith(0.1));
  });

  test('getAllChunksWithVectors returns the chunks of one named model only', () => {
    storeTwoGenerations();

    const withVectors = db.getAllChunksWithVectors({ model: PREVIOUS_MODEL });

    expect(withVectors.map((chunk) => chunk.id)).toEqual(['net-1_0']);
  });
});

describe('src/db.js profile queries', () => {
  function profileQueries() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'db.js'), 'utf8');
    return [...source.matchAll(/FROM profiles[^`'"]*/g)].map((match) => match[0]);
  }

  test('no query selects a single profile by recency alone', () => {
    const byRecency = profileQueries().filter(
      (query) => query.includes('LIMIT 1') && !query.includes('WHERE'),
    );

    expect(byRecency).toEqual([]);
  });

  test('no query that reads or deletes a single profile row runs without a user identifier', () => {
    const unowned = profileQueries()
      .filter((query) => /WHERE id = \?/.test(query))
      .filter((query) => !query.includes('user_id'));

    expect(unowned).toEqual([]);
  });
});
