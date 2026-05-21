'use strict';

const SearchEngine = require('../src/search-engine');

describe('SearchEngine: Hybrid Functions', () => {
  // ─── cosineSimilarity (preserved from v4) ─────────────────
  
  test('identical vectors return 1.0', () => {
    expect(SearchEngine.cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0);
  });

  test('orthogonal vectors return 0.0', () => {
    expect(SearchEngine.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  test('empty/null vectors return 0', () => {
    expect(SearchEngine.cosineSimilarity([], [])).toBe(0);
    expect(SearchEngine.cosineSimilarity(null, [1])).toBe(0);
    expect(SearchEngine.cosineSimilarity([1], null)).toBe(0);
  });

  test('different length vectors return 0', () => {
    expect(SearchEngine.cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  // ─── serializeVector / deserializeVector ──────────────────

  test('serialize and deserialize roundtrip', () => {
    const vec = [0.1, 0.5, 0.9, -0.3];
    const blob = SearchEngine.serializeVector(vec);
    expect(Buffer.isBuffer(blob)).toBe(true);

    const restored = SearchEngine.deserializeVector(blob);
    expect(restored).toHaveLength(4);
    restored.forEach((v, i) => expect(v).toBeCloseTo(vec[i], 5));
  });

  test('serialize null returns null', () => {
    expect(SearchEngine.serializeVector(null)).toBeNull();
  });

  test('deserialize null returns null', () => {
    expect(SearchEngine.deserializeVector(null)).toBeNull();
  });

  // ─── scoreChunksByVector ──────────────────────────────────

  test('scores chunks above threshold', () => {
    const profileVector = [1, 0, 0];
    const chunks = [
      { id: 'c1', content: 'a', vector: [1, 0, 0] },       // score 1.0
      { id: 'c2', content: 'b', vector: [0, 1, 0] },       // score 0.0
      { id: 'c3', content: 'c', vector: [0.8, 0.6, 0] },   // score ~0.8
    ];

    const result = SearchEngine.scoreChunksByVector(chunks, profileVector, 0.5);
    expect(result).toHaveLength(2); // c1 and c3
    expect(result[0].id).toBe('c1');
    expect(result[0].score).toBeCloseTo(1.0);
  });

  test('returns empty for no chunks', () => {
    expect(SearchEngine.scoreChunksByVector([], [1, 0], 0.5)).toEqual([]);
  });

  test('returns empty for no profileVector', () => {
    expect(SearchEngine.scoreChunksByVector([{ id: '1', vector: [1] }], null, 0.5)).toEqual([]);
  });

  test('handles serialized (Buffer) vectors', () => {
    const profileVector = [1, 0, 0];
    const serialized = SearchEngine.serializeVector([0.9, 0.1, 0]);
    const chunks = [{ id: 'c1', content: 'test', vector: serialized }];
    
    const result = SearchEngine.scoreChunksByVector(chunks, profileVector, 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeGreaterThan(0.5);
  });

  // ─── mergeResults ─────────────────────────────────────────

  test('merges and deduplicates BM25 + semantic', () => {
    const bm25 = [
      { id: 'c1', content: 'a', rank: -2 },
      { id: 'c2', content: 'b', rank: -1 },
    ];
    const semantic = [
      { id: 'c1', content: 'a', semanticScore: 0.9 },  // duplicate
      { id: 'c3', content: 'c', semanticScore: 0.8 },  // new
    ];

    const result = SearchEngine.mergeResults(bm25, semantic, { bm25Weight: 0.4, semanticWeight: 0.6 });

    // c1 appears once (merged), c2 and c3 also appear
    const ids = result.map((r) => r.id);
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).toContain('c3');
    expect(new Set(ids).size).toBe(3); // no duplicates
  });

  test('empty inputs return empty', () => {
    expect(SearchEngine.mergeResults([], [], {})).toEqual([]);
  });

  // ─── groupByParent ────────────────────────────────────────

  test('groups chunks by parent_id', () => {
    const chunks = [
      { id: 'c1', parent_id: 'p1', score: 0.9, chunk_index: 0 },
      { id: 'c2', parent_id: 'p1', score: 0.7, chunk_index: 1 },
      { id: 'c3', parent_id: 'p2', score: 0.8, chunk_index: 0 },
    ];

    const result = SearchEngine.groupByParent(chunks);
    expect(result).toHaveLength(2);
    
    // p1 has bestScore 0.9 > p2's 0.8, so p1 first
    expect(result[0].parentId).toBe('p1');
    expect(result[0].matchedChunks).toHaveLength(2);
    expect(result[1].parentId).toBe('p2');
  });

  test('empty chunks returns empty', () => {
    expect(SearchEngine.groupByParent([])).toEqual([]);
    expect(SearchEngine.groupByParent(null)).toEqual([]);
  });

  // ─── findRelevant (legacy v4 interface) ────────────────────

  test('findRelevant with empty batch returns empty', async () => {
    expect(await SearchEngine.findRelevant([], [1, 0])).toEqual([]);
    expect(await SearchEngine.findRelevant(null, [1, 0])).toEqual([]);
  });
});
