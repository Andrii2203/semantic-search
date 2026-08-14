'use strict';

const { ndcgAtK, recallAtK } = require('../../src/eval/metrics');

const judgments = { d1: 3, d2: 2, d3: 1 };

function padding(count, prefix) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

describe('src/eval/metrics.js', () => {
  test('nDCG@10 of a perfect ranking is 1', () => {
    const ranking = ['d1', 'd2', 'd3', ...padding(7, 'x')];
    expect(ndcgAtK(ranking, judgments, 10)).toBeCloseTo(1, 10);
  });

  test('nDCG@10 of a ranking with no relevant document in the top ten is 0', () => {
    const ranking = padding(10, 'x');
    expect(ndcgAtK(ranking, judgments, 10)).toBe(0);
  });

  test('nDCG@10 rewards a relevant document at rank one above the same document at rank ten', () => {
    const single = { d1: 1 };
    const first = ndcgAtK(['d1', ...padding(9, 'x')], single, 10);
    const tenth = ndcgAtK([...padding(9, 'x'), 'd1'], single, 10);

    expect(first).toBeCloseTo(1, 10);
    expect(tenth).toBeCloseTo(1 / Math.log2(11), 10);
    expect(first).toBeGreaterThan(tenth);
  });

  test('Recall@100 of a ranking containing every relevant document is 1', () => {
    const ranking = [...padding(97, 'x'), 'd3', 'd2', 'd1'];
    expect(recallAtK(ranking, judgments, 100)).toBe(1);
  });

  test('a graded judgment of 2 counts above a graded judgment of 1 in nDCG', () => {
    const pair = { high: 2, low: 1 };
    const highFirst = ndcgAtK(['high', 'low'], pair, 10);
    const lowFirst = ndcgAtK(['low', 'high'], pair, 10);

    expect(highFirst).toBeCloseTo(1, 10);
    expect(lowFirst).toBeLessThan(highFirst);
  });

  test('a relevant document beyond k does not count towards recall at k', () => {
    const ranking = [...padding(100, 'x'), 'd1', 'd2', 'd3'];
    expect(recallAtK(ranking, judgments, 100)).toBe(0);
  });

  test('a judgment of grade zero is not relevant', () => {
    expect(recallAtK(['z'], { z: 0 }, 10)).toBe(0);
    expect(ndcgAtK(['z'], { z: 0 }, 10)).toBe(0);
  });

  test('a query with no relevant document scores zero rather than dividing by zero', () => {
    expect(ndcgAtK(['a', 'b'], {}, 10)).toBe(0);
    expect(recallAtK(['a', 'b'], {}, 10)).toBe(0);
  });

  test('a ranking shorter than k is scored on the documents it has', () => {
    expect(ndcgAtK(['d1'], { d1: 3 }, 10)).toBeCloseTo(1, 10);
  });

  test('an unjudged document is treated as not relevant', () => {
    const ranking = ['unseen', 'd1'];
    const expected = (2 ** 3 - 1) / Math.log2(3) / ((2 ** 3 - 1) / Math.log2(2));
    expect(ndcgAtK(ranking, { d1: 3 }, 10)).toBeCloseTo(expected, 10);
  });
});
