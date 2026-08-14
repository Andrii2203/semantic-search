'use strict';

const { compare, pairedBootstrap } = require('../../src/eval/significance');

const seed = 7;

function values(pairs) {
  return pairs.map(([id, value]) => ({ queryId: id, value }));
}

const identical = values([['q1', 0.4], ['q2', 0.6], ['q3', 0.5], ['q4', 0.7]]);
const better = values([['q1', 0.5], ['q2', 0.7], ['q3', 0.6], ['q4', 0.8]]);
const noisy = values([['q1', 0.9], ['q2', 0.1], ['q3', 0.8], ['q4', 0.2]]);

describe('src/eval/significance.js', () => {
  test('a comparison of two configurations reports the mean difference per metric', () => {
    const result = pairedBootstrap(better, identical, { seed });
    expect(result.difference).toBeCloseTo(0.1, 10);
  });

  test('a comparison reports a confidence interval for that difference, from a paired bootstrap over queries', () => {
    const result = pairedBootstrap(better, identical, { seed });

    expect(result.lower).toBeLessThanOrEqual(result.difference);
    expect(result.upper).toBeGreaterThanOrEqual(result.difference);
    expect(result.lower).toBeGreaterThan(0);
  });

  test('a configuration compared with itself reports a difference of zero and an interval containing zero', () => {
    const result = pairedBootstrap(identical, identical, { seed });

    expect(result.difference).toBe(0);
    expect(result.lower).toBe(0);
    expect(result.upper).toBe(0);
    expect(result.winRate).toBe(0);
  });

  test('two comparisons with the same seed produce identical numbers', () => {
    const first = pairedBootstrap(noisy, identical, { seed });
    const second = pairedBootstrap(noisy, identical, { seed });

    expect(first).toEqual(second);
  });

  test('a different seed leaves the observed difference unchanged', () => {
    const first = pairedBootstrap(noisy, identical, { seed });
    const second = pairedBootstrap(noisy, identical, { seed: seed + 1 });

    expect(second.difference).toBeCloseTo(first.difference, 10);
    expect(second.lower).toBeLessThanOrEqual(second.difference);
    expect(second.upper).toBeGreaterThanOrEqual(second.difference);
  });

  test('a comparison refuses two configurations scored on different query sets', () => {
    const shifted = values([['q1', 0.4], ['q9', 0.6], ['q3', 0.5], ['q4', 0.7]]);
    expect(() => pairedBootstrap(better, shifted, { seed })).toThrow(/q9|different queries/);
  });

  test('a wider spread of per query differences widens the interval', () => {
    const steady = pairedBootstrap(better, identical, { seed });
    const unsteady = pairedBootstrap(noisy, identical, { seed });

    expect(unsteady.upper - unsteady.lower).toBeGreaterThan(steady.upper - steady.lower);
  });

  test('the win rate is the share of resamples in which the first configuration leads', () => {
    const result = pairedBootstrap(better, identical, { seed });
    expect(result.winRate).toBe(1);

    const reversed = pairedBootstrap(identical, better, { seed });
    expect(reversed.winRate).toBe(0);
  });

  test('a comparison names both configurations and the metric it compared', () => {
    const rows = compare(
      { configuration: 'a', metrics: [{ name: 'nDCG@10', value: 0.5 }], perQuery: { 'nDCG@10': better } },
      { configuration: 'b', metrics: [{ name: 'nDCG@10', value: 0.4 }], perQuery: { 'nDCG@10': identical } },
      { seed },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe('nDCG@10');
    expect(rows[0].first).toBe('a');
    expect(rows[0].second).toBe('b');
    expect(rows[0].difference).toBeCloseTo(0.1, 10);
  });
});
