'use strict';

const request = require('supertest');
const db = require('../src/db');

// v7.1 dedup corpus: shared internet content + personal user_matches

describe('Dedup corpus (v7.1)', () => {
  beforeEach(() => {
    db.init(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('fingerprint — per collection', () => {
    test('same internet content from different sources → stored once', () => {
      const inserted1 = db.insertItem({
        id: 'hn-story', content: 'Big tech news everyone reposts', type: 'post', source: 'hn', metadata: {},
      });
      const inserted2 = db.insertItem({
        id: 'reddit-story', content: 'Big tech news everyone reposts', type: 'post', source: 'reddit', metadata: {},
      });

      expect(inserted1).toBe(true);
      expect(inserted2).toBe(false); // duplicate content → skipped
      expect(db.getItemCount({})).toBe(1);
    });

    test('same files content for different users → both stored (isolation)', () => {
      db.createUser({ id: 'user-a', email: 'a@x.com', passwordHash: 'h' });
      db.createUser({ id: 'user-b', email: 'b@x.com', passwordHash: 'h' });
      const inserted1 = db.insertItem({
        id: 'resume-a', content: 'Senior dev resume text', type: 'resume', source: 'file-upload',
        collectionId: 'files', userId: 'user-a', metadata: {},
      });
      const inserted2 = db.insertItem({
        id: 'resume-b', content: 'Senior dev resume text', type: 'resume', source: 'file-upload',
        collectionId: 'files', userId: 'user-b', metadata: {},
      });

      expect(inserted1).toBe(true);
      expect(inserted2).toBe(true); // different owner → different fingerprint
    });

    test('internet items are stored without an owner (corpus rows)', () => {
      db.insertItem({
        id: 'corpus-1', content: 'Shared corpus content', type: 'post', source: 'hn',
        userId: 'user-a', metadata: {},
      });
      expect(db.getItemById('corpus-1').user_id).toBeNull();
    });
  });

  describe('user_matches CRUD', () => {
    beforeEach(() => {
      db.createUser({ id: 'user-a', email: 'a@x.com', passwordHash: 'h' });
      db.createUser({ id: 'user-b', email: 'b@x.com', passwordHash: 'h' });
      db.insertItem({ id: 'item-1', content: 'Some shared post content', type: 'post', source: 'hn', metadata: {} });
    });

    test('upsertUserMatch creates and updates a match', () => {
      db.upsertUserMatch({ userId: 'user-a', itemId: 'item-1', score: 0.8 });
      expect(db.getUserMatch('user-a', 'item-1').score).toBeCloseTo(0.8);

      db.upsertUserMatch({ userId: 'user-a', itemId: 'item-1', status: 'starred' });
      const match = db.getUserMatch('user-a', 'item-1');
      expect(match.status).toBe('starred');
      expect(match.score).toBeCloseTo(0.8); // score preserved on status-only update
    });

    test('status of user A does not affect user B', () => {
      db.upsertUserMatch({ userId: 'user-a', itemId: 'item-1' });
      db.upsertUserMatch({ userId: 'user-b', itemId: 'item-1' });

      db.setItemStatusForUser('item-1', 'user-a', 'approved');

      expect(db.getUserMatch('user-a', 'item-1').status).toBe('approved');
      expect(db.getUserMatch('user-b', 'item-1').status).toBe('new');
    });

    test('setItemStatusForUser on files item updates items.status directly', () => {
      db.insertItem({
        id: 'file-1', content: 'Private file', type: 'resume', source: 'file-upload',
        collectionId: 'files', userId: 'user-a', metadata: {},
      });
      db.setItemStatusForUser('file-1', 'user-a', 'approved');
      expect(db.getItemById('file-1').status).toBe('approved');
      expect(db.getUserMatch('user-a', 'file-1')).toBeNull();
    });

    test('deleteUserMatch removes match but keeps corpus item', () => {
      db.upsertUserMatch({ userId: 'user-a', itemId: 'item-1' });
      expect(db.deleteUserMatch('user-a', 'item-1')).toBe(true);
      expect(db.getUserMatch('user-a', 'item-1')).toBeNull();
      expect(db.getItemById('item-1')).not.toBeNull();
    });
  });

  describe('personal item views', () => {
    beforeEach(() => {
      db.createUser({ id: 'user-a', email: 'a@x.com', passwordHash: 'h' });
      db.insertItemsBatch([
        { id: 'm-1', content: 'Matched content one', type: 'post', source: 'hn', metadata: {} },
        { id: 'm-2', content: 'Matched content two', type: 'post', source: 'reddit', metadata: {} },
        { id: 'u-1', content: 'Unmatched corpus content', type: 'post', source: 'hn', metadata: {} },
      ]);
      db.upsertUserMatch({ userId: 'user-a', itemId: 'm-1', score: 0.9 });
      db.upsertUserMatch({ userId: 'user-a', itemId: 'm-2', score: 0.7, status: 'approved' });
      db.insertItem({
        id: 'f-1', content: 'My private file', type: 'resume', source: 'file-upload',
        collectionId: 'files', userId: 'user-a', metadata: {},
      });
    });

    test('getItemsPage returns matched internet items + own private items', () => {
      const { items } = db.getItemsPage({ userId: 'user-a' });
      const ids = items.map((i) => i.id);
      expect(ids).toContain('m-1');
      expect(ids).toContain('m-2');
      expect(ids).toContain('f-1');
      expect(ids).not.toContain('u-1'); // in corpus, but not matched to this user
    });

    test('item status and score come from user_matches', () => {
      const { items } = db.getItemsPage({ userId: 'user-a', status: 'approved' });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('m-2');
      expect(items[0].score).toBeCloseTo(0.7);
    });

    test('getItemCount counts via the personal view', () => {
      expect(db.getItemCount({ userId: 'user-a' })).toBe(3);
      expect(db.getItemCount({ userId: 'user-a', status: 'new' })).toBe(2); // m-1 + f-1
    });

    test('personal view filters: source (csv), type, collectionId', () => {
      expect(db.getItemCount({ userId: 'user-a', source: 'hn, reddit' })).toBe(2);
      const { items: typed } = db.getItemsPage({ userId: 'user-a', type: 'resume' });
      expect(typed.map((i) => i.id)).toEqual(['f-1']);
      const { items: files } = db.getItemsPage({ userId: 'user-a', collectionId: 'files' });
      expect(files.map((i) => i.id)).toEqual(['f-1']);
    });

    test('getItems (offset variant) uses the personal view too', () => {
      const items = db.getItems({ userId: 'user-a', limit: 2, offset: 0 });
      expect(items).toHaveLength(2);
      const rest = db.getItems({ userId: 'user-a', limit: 10, offset: 2 });
      expect(rest).toHaveLength(1);
    });
  });

  describe('search visibility (shared corpus + own private)', () => {
    beforeEach(() => {
      db.createUser({ id: 'user-a', email: 'a@x.com', passwordHash: 'h' });
      db.createUser({ id: 'user-b', email: 'b@x.com', passwordHash: 'h' });
      db.insertItem({ id: 'net-1', content: 'Shared internet article', type: 'post', source: 'hn', metadata: {} });
      db.insertItem({
        id: 'file-a', content: 'Private file of A', type: 'resume', source: 'file-upload',
        collectionId: 'files', userId: 'user-a', metadata: {},
      });
      const fakeVector = Buffer.alloc(8);
      db.insertChunk({ id: 'net-1_0', parentId: 'net-1', content: 'Shared internet article', chunkIndex: 0, strategy: 'fixed', vector: fakeVector, metadata: {} });
      db.insertChunk({ id: 'file-a_0', parentId: 'file-a', content: 'Private file of A', chunkIndex: 0, strategy: 'fixed', vector: fakeVector, metadata: {} });
    });

    test('user sees corpus chunks + own private chunks, not someone else\'s', () => {
      const forA = db.getAllChunksWithVectors({ userId: 'user-a' });
      expect(forA.map((c) => c.id).sort()).toEqual(['file-a_0', 'net-1_0']);

      const forB = db.getAllChunksWithVectors({ userId: 'user-b' });
      expect(forB.map((c) => c.id)).toEqual(['net-1_0']);
    });

    test('collectionId=internet ignores user filter (shared corpus)', () => {
      const chunks = db.getAllChunksWithVectors({ collectionId: 'internet', userId: 'user-b' });
      expect(chunks.map((c) => c.id)).toEqual(['net-1_0']);
    });

    test('collectionId=files is owner-scoped', () => {
      const forA = db.getAllChunksWithVectors({ collectionId: 'files', userId: 'user-a' });
      expect(forA.map((c) => c.id)).toEqual(['file-a_0']);
      const forB = db.getAllChunksWithVectors({ collectionId: 'files', userId: 'user-b' });
      expect(forB).toEqual([]);
    });

    test('chunksSearch respects the same visibility rules', () => {
      const forB = db.chunksSearch(['private'], { userId: 'user-b' });
      expect(forB).toEqual([]);
      const forA = db.chunksSearch(['private'], { userId: 'user-a' });
      expect(forA.map((c) => c.id)).toEqual(['file-a_0']);
    });
  });

  describe('backfillInternetCorpus (migration 012 logic)', () => {
    test('collapses duplicates, moves statuses to user_matches, frees corpus rows', () => {
      const d = db.getDb();
      db.createUser({ id: 'user-a', email: 'a@x.com', passwordHash: 'h' });
      db.createUser({ id: 'user-b', email: 'b@x.com', passwordHash: 'h' });

      // Legacy Phase 2 state: same content stored once per user with per-user fingerprints
      const insertLegacy = d.prepare(`
        INSERT INTO items (id, content, type, source, metadata, status, fingerprint, collection_id, user_id, created_at)
        VALUES (?, ?, 'post', 'hn', '{}', ?, ?, 'internet', ?, ?)
      `);
      insertLegacy.run('legacy-a', 'Same story content', 'starred', 'fp-user-a', 'user-a', '2026-01-01 10:00:00');
      insertLegacy.run('legacy-b', 'Same story content', 'skipped', 'fp-user-b', 'user-b', '2026-01-01 11:00:00');
      db.insertChunk({ id: 'legacy-b_0', parentId: 'legacy-b', content: 'Same story content', chunkIndex: 0, strategy: 'fixed', metadata: {} });

      db.backfillInternetCorpus(d);

      // One canonical row remains, without owner
      expect(db.getItemById('legacy-a').user_id).toBeNull();
      expect(db.getItemById('legacy-b')).toBeNull();
      expect(db.getChunksByParent('legacy-b')).toEqual([]);

      // Personal statuses preserved per user on the canonical item
      expect(db.getUserMatch('user-a', 'legacy-a').status).toBe('starred');
      expect(db.getUserMatch('user-b', 'legacy-a').status).toBe('skipped');
    });
  });
});

// ─── Routes: status + delete over the dedup corpus ─────────────

describe('Routes over dedup corpus', () => {
  const { app } = require('../src/server');
  let cookieA, cookieB, userIdA;

  beforeAll(async () => {
    db.init(':memory:');

    const resA = await request(app).post('/api/auth/register').send({ email: 'route-a@x.com', password: 'password123' });
    cookieA = resA.headers['set-cookie'][0].split(';')[0];
    userIdA = db.findUserByEmail('route-a@x.com').id;
    const resB = await request(app).post('/api/auth/register').send({ email: 'route-b@x.com', password: 'password123' });
    cookieB = resB.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(() => db.close());

  test('DELETE internet item removes the match only — corpus row survives', async () => {
    db.insertItem({ id: 'net-del', content: 'Corpus content to hide', type: 'post', source: 'hn', metadata: {} });
    db.upsertUserMatch({ userId: userIdA, itemId: 'net-del' });

    const res = await request(app).delete('/api/items/net-del').set('Cookie', cookieA);
    expect(res.statusCode).toBe(200);
    expect(db.getUserMatch(userIdA, 'net-del')).toBeNull();
    expect(db.getItemById('net-del')).not.toBeNull(); // other users may still need it
  });

  test('DELETE files item removes it physically with chunks', async () => {
    db.insertItem({
      id: 'file-del', content: 'Private file to delete', type: 'resume', source: 'file-upload',
      collectionId: 'files', userId: userIdA, metadata: {},
    });
    db.insertChunk({ id: 'file-del_0', parentId: 'file-del', content: 'Private file to delete', chunkIndex: 0, strategy: 'fixed', metadata: {} });

    const res = await request(app).delete('/api/items/file-del').set('Cookie', cookieA);
    expect(res.statusCode).toBe(200);
    expect(db.getItemById('file-del')).toBeNull();
    expect(db.getChunksByParent('file-del')).toEqual([]);
  });

  test('user B cannot act on user A private file → 404', async () => {
    db.insertItem({
      id: 'file-priv', content: 'Strictly private', type: 'resume', source: 'file-upload',
      collectionId: 'files', userId: userIdA, metadata: {},
    });

    const del = await request(app).delete('/api/items/file-priv').set('Cookie', cookieB);
    expect(del.statusCode).toBe(404);
    const star = await request(app).post('/api/items/file-priv/star').set('Cookie', cookieB);
    expect(star.statusCode).toBe(404);
  });
});
