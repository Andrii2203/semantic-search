'use strict';

const SearchEngine = require('../src/search-engine');

// Phase 2.5 ranking: RRF fusion + MMR diversity. Pure functions —
// these tests verify ranking behavior and survive refactors.

describe('rrfMerge — Reciprocal Rank Fusion', () => {
  test('item ranked #1 in both lists gets the highest RRF score', () => {
    const bm25 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const semantic = [{ id: 'a' }, { id: 'c' }, { id: 'b' }];

    const merged = SearchEngine.rrfMerge(bm25, semantic, { k: 60 });

    expect(merged[0].id).toBe('a');
    expect(merged[0].rrfScore).toBeCloseTo(2 / 61);
  });

  test('combines ranks, not raw scores (scale-independent)', () => {
    // 'b' is #2 in both → should beat items that are #1 in only one list
    const bm25 = [{ id: 'x' }, { id: 'b' }];
    const semantic = [{ id: 'y' }, { id: 'b' }];

    const merged = SearchEngine.rrfMerge(bm25, semantic, { k: 60 });
    const byId = Object.fromEntries(merged.map((m) => [m.id, m.rrfScore]));

    // b appears in both at rank 2: 1/62 + 1/62; x and y only once at rank 1: 1/61
    expect(byId.b).toBeCloseTo(2 / 62);
    expect(byId.b).toBeGreaterThan(byId.x);
    expect(byId.b).toBeGreaterThan(byId.y);
    expect(merged[0].id).toBe('b');
  });

  test('records bm25Rank and semanticRank per item', () => {
    const merged = SearchEngine.rrfMerge(
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'b' }],
      {},
    );
    const a = merged.find((m) => m.id === 'a');
    const b = merged.find((m) => m.id === 'b');

    expect(a.bm25Rank).toBe(1);
    expect(a.semanticRank).toBeNull();
    expect(b.bm25Rank).toBe(2);
    expect(b.semanticRank).toBe(1);
  });

  test('handles one empty list (semantic-only or bm25-only)', () => {
    const bm25Only = SearchEngine.rrfMerge([{ id: 'a' }, { id: 'b' }], [], {});
    expect(bm25Only.map((m) => m.id)).toEqual(['a', 'b']);
    expect(bm25Only[0].semanticRank).toBeNull();

    const semanticOnly = SearchEngine.rrfMerge([], [{ id: 'c' }], {});
    expect(semanticOnly[0].id).toBe('c');
    expect(semanticOnly[0].bm25Rank).toBeNull();
  });

  test('preserves semanticScore from the semantic list', () => {
    const merged = SearchEngine.rrfMerge(
      [{ id: 'a' }],
      [{ id: 'a', semanticScore: 0.77 }],
      {},
    );
    expect(merged[0].semanticScore).toBeCloseTo(0.77);
  });
});

describe('mmrSelect — Maximal Marginal Relevance', () => {
  // Three docs: two nearly identical (a, b), one different (c)
  const docA = { id: 'a', score: 0.9, vector: [1, 0, 0] };
  const docB = { id: 'b', score: 0.85, vector: [0.99, 0.01, 0] }; // ~identical to a
  const docC = { id: 'c', score: 0.6, vector: [0, 1, 0] }; // different topic

  test('diversity (λ<1) promotes the different doc over the near-duplicate', () => {
    const selected = SearchEngine.mmrSelect([docA, docB, docC], { lambda: 0.5, topN: 2 });
    expect(selected[0].id).toBe('a'); // most relevant first
    expect(selected[1].id).toBe('c'); // diverse pick beats near-duplicate b
  });

  test('λ=1.0 disables diversity — pure relevance order', () => {
    const selected = SearchEngine.mmrSelect([docA, docB, docC], { lambda: 1.0, topN: 3 });
    expect(selected.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  test('respects topN', () => {
    const selected = SearchEngine.mmrSelect([docA, docB, docC], { lambda: 0.5, topN: 1 });
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('a');
  });

  test('docs without vectors are never penalized for similarity', () => {
    const noVec1 = { id: 'n1', score: 0.8 };
    const noVec2 = { id: 'n2', score: 0.7 };
    const selected = SearchEngine.mmrSelect([noVec1, noVec2], { lambda: 0.5, topN: 2 });
    expect(selected.map((d) => d.id)).toEqual(['n1', 'n2']);
  });

  test('empty input returns empty', () => {
    expect(SearchEngine.mmrSelect([], { lambda: 0.5 })).toEqual([]);
  });
});
