'use strict';

jest.mock('../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const mockChat = jest.fn();
jest.mock('../src/groq-client', () => ({
  getGroqClient: jest.fn(() => ({ chat: mockChat })),
  resetGroqClient: jest.fn(),
}));

const { rerank } = require('../src/reranker');

const makeResult = (id, score = 0.8) => ({
  parentId: id,
  content: `Content for result ${id}`,
  score,
  item: { id, content: `Item content ${id}` },
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('rerank', () => {
  it('returns empty array for empty results', async () => {
    const result = await rerank([], 'query');
    expect(result).toEqual([]);
  });

  it('returns empty array for null results', async () => {
    const result = await rerank(null, 'query');
    expect(result).toEqual([]);
  });

  it('returns results unchanged for empty query', async () => {
    const results = [makeResult('a'), makeResult('b')];
    const out = await rerank(results, '');
    expect(out).toEqual(results);
  });

  it('returns results unchanged for whitespace-only query', async () => {
    const results = [makeResult('a')];
    const out = await rerank(results, '   ');
    expect(out).toEqual(results);
  });

  it('calls groq.chat and returns scores sorted descending', async () => {
    mockChat.mockResolvedValue('[0.9, 0.3]');

    const results = [makeResult('a', 0.5), makeResult('b', 0.5)];
    const out = await rerank(results, 'javascript developer', 10);

    expect(mockChat).toHaveBeenCalled();
    expect(out[0].rerankScore).toBeGreaterThan(out[1].rerankScore);
  });

  it('uses fallback scores when groq.chat fails', async () => {
    mockChat.mockRejectedValue(new Error('Groq down'));

    const results = [makeResult('a', 0.7), makeResult('b', 0.6)];
    const out = await rerank(results, 'test query', 10);

    expect(out).toHaveLength(2);
    expect(out[0].rerankScore).toBeDefined();
  });

  it('uses fallback when API returns non-array JSON', async () => {
    mockChat.mockResolvedValue('{"not": "an array"}');

    const results = [makeResult('a', 0.6)];
    const out = await rerank(results, 'test', 10);

    expect(out[0].rerankScore).toBe(0.6); // original score as fallback
  });

  it('uses fallback when API returns invalid JSON', async () => {
    mockChat.mockResolvedValue('not valid json at all');

    const results = [makeResult('a', 0.5)];
    const out = await rerank(results, 'test', 10);

    expect(out[0].rerankScore).toBe(0.5);
  });

  it('appends non-reranked items (beyond topN) with rerankScore 0', async () => {
    mockChat.mockResolvedValue('[0.8]');

    const results = [makeResult('a', 0.9), makeResult('b', 0.8), makeResult('c', 0.7)];
    const out = await rerank(results, 'test', 1); // topN=1, only first is reranked

    const extra = out.find((r) => r.parentId === 'b' || r.parentId === 'c');
    expect(extra.rerankScore).toBe(0);
  });

  it('clamps scores to [0, 1]', async () => {
    mockChat.mockResolvedValue('[1.5, -0.5]');

    const results = [makeResult('a'), makeResult('b')];
    const out = await rerank(results, 'test', 10);

    for (const r of out) {
      expect(r.rerankScore).toBeGreaterThanOrEqual(0);
      expect(r.rerankScore).toBeLessThanOrEqual(1);
    }
  });
});
