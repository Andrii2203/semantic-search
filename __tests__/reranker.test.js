'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const logger = require('../src/logger');
const constants = require('../src/search-constants');
const { rerank } = require('../src/reranker');

const root = path.join(__dirname, '..');

const makeResult = (id, score = 0.8) => ({
  parentId: id,
  content: `Content for result ${id}`,
  score,
  item: { id, content: `Item content ${id}` },
});

const scorerReturning = (scores) => jest.fn(async () => scores);

const manyResults = (count) =>
  Array.from({ length: count }, (_, index) => makeResult(`item-${index}`, 1 - index / count));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('rerank, the results it is given', () => {
  it('returns an empty list when it is given no results', async () => {
    expect(await rerank([], 'query', { scoreAll: scorerReturning([]) })).toEqual([]);
    expect(await rerank(null, 'query', { scoreAll: scorerReturning([]) })).toEqual([]);
  });

  it('returns the results unchanged when the query is empty or is only whitespace', async () => {
    const results = [makeResult('a'), makeResult('b')];
    const scoreAll = scorerReturning([1, 2]);

    expect(await rerank(results, '', { scoreAll })).toEqual(results);
    expect(await rerank(results, '   ', { scoreAll })).toEqual(results);
    expect(scoreAll).not.toHaveBeenCalled();
  });
});

describe('rerank, the order it produces', () => {
  it('orders the results it scored by cross encoder score, highest first', async () => {
    const scoreAll = scorerReturning([-4, 6, 1]);
    const results = [makeResult('a'), makeResult('b'), makeResult('c')];

    const out = await rerank(results, 'javascript developer', { scoreAll });

    expect(out.map((entry) => entry.parentId)).toEqual(['b', 'c', 'a']);
    expect(scoreAll).toHaveBeenCalledWith('javascript developer', [
      'Content for result a',
      'Content for result b',
      'Content for result c',
    ]);
  });

  it('scores at most rerankDepth results, and the results past that depth keep their fused order behind the scored ones', async () => {
    const depth = constants.rerankDepth;
    const results = manyResults(depth + 3);
    const scoreAll = jest.fn(async (_query, documents) => documents.map((_text, index) => index));

    const out = await rerank(results, 'test', { scoreAll });

    expect(scoreAll.mock.calls[0][1]).toHaveLength(depth);
    expect(out).toHaveLength(depth + 3);
    expect(out[0].parentId).toBe(`item-${depth - 1}`);
    expect(out.slice(depth).map((entry) => entry.parentId)).toEqual([
      `item-${depth}`,
      `item-${depth + 1}`,
      `item-${depth + 2}`,
    ]);
  });
});

describe('rerank, the scores it reports', () => {
  it('gives a result it scored a rerankScore between 0 and 1, and a result past the depth a rerankScore of null', async () => {
    const depth = 2;
    const results = [makeResult('a'), makeResult('b'), makeResult('c')];
    const scoreAll = scorerReturning([11, -11]);

    const out = await rerank(results, 'test', { scoreAll, depth });

    for (const entry of out.slice(0, depth)) {
      expect(entry.rerankScore).toBeGreaterThan(0);
      expect(entry.rerankScore).toBeLessThan(1);
    }
    expect(out[0].rerankScore).toBeGreaterThan(out[1].rerankScore);
    expect(out[depth].rerankScore).toBeNull();
  });

  it('returns the fused order and logs a warning when the scorer throws', async () => {
    const results = [makeResult('a', 0.9), makeResult('b', 0.8)];
    const scoreAll = jest.fn(async () => {
      throw new Error('model failed to load');
    });

    const out = await rerank(results, 'test', { scoreAll });

    expect(out).toEqual(results);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('rerank, the scorer it reaches', () => {
  const readSource = (file) => fs.readFileSync(path.join(root, file), 'utf8');

  it('reaches no language model provider', () => {
    expect(readSource('src/reranker.js')).not.toMatch(/groq|anthropic/i);
  });

  it('scores with the same module src/eval/harness.js scores with', () => {
    const requiredBy = (file, pattern) => {
      const found = readSource(file).match(pattern);
      return found && path.resolve(root, path.dirname(file), found[1]);
    };

    const fromReranker = requiredBy('src/reranker.js', /require\('(\.[^']*cross-encoder)'\)/);
    const fromHarness = requiredBy('src/eval/harness.js', /require\('(\.[^']*cross-encoder)'\)/);

    expect(fromReranker).toBe(path.join(root, 'src', 'cross-encoder'));
    expect(fromHarness).toBe(fromReranker);
  });
});
