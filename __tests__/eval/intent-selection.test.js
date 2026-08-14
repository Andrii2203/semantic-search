'use strict';

const { rankByCoverage } = require('../../src/eval/intent-coverage');
const { pruneIntents, assignSplits } = require('../../src/eval/intent-selection');

const posts = [
  { id: 'p1', content: 'inflation and interest rates at the central bank' },
  { id: 'p2', content: 'a personal blog about my cat' },
  { id: 'p3', content: 'quantum error correction milestone' },
];

const vectors = {
  p1: [1, 0, 0],
  p2: [0, 0, 1],
  p3: [0, 1, 0],
  a1: [1, 0, 0],
  a2: [0.9, 0.1, 0],
  a3: [0.8, 0.2, 0],
  a4: [0, 1, 0],
  a5: [0, 0.9, 0.1],
};

const articles = ['a1', 'a2', 'a3', 'a4', 'a5'];

describe('src/eval/intent-selection.js', () => {
  test('the chooser ranks candidate posts by how well the article corpus covers their subject', () => {
    const ranked = rankByCoverage(posts, vectors, articles.map((id) => ({ id, vector: vectors[id] })));

    expect(ranked.map((row) => row.id)).toEqual(['p1', 'p3', 'p2']);
    expect(ranked[0].coverage).toBeGreaterThan(ranked[2].coverage);
  });

  test('the chooser never reads a judgment, so selection cannot be contaminated by the answer key', () => {
    const source = require('fs').readFileSync(
      require.resolve('../../src/eval/intent-coverage'),
      'utf-8',
    );

    expect(source).not.toMatch(/judgment|qrel|grade/i);
    expect(rankByCoverage.length).toBe(3);
  });

  test('pruning keeps an intent only when it has at least three articles graded relevant', () => {
    const qrels = new Map([
      ['keep', new Map([['a1', 3], ['a2', 2], ['a3', 2], ['a4', 0]])],
      ['thin', new Map([['a1', 3], ['a2', 2], ['a3', 1]])],
      ['empty', new Map([['a1', 0], ['a2', 0]])],
    ]);

    const pruned = pruneIntents(
      [{ id: 'keep' }, { id: 'thin' }, { id: 'empty' }, { id: 'unjudged' }],
      qrels,
    );

    expect(pruned.map((row) => row.id).sort()).toEqual(['empty', 'keep']);
    expect(pruned.find((row) => row.id === 'keep').group).toBe('answerable');
    expect(pruned.find((row) => row.id === 'empty').group).toBe('unanswerable');
  });

  test('both splits carry both groups after pruning', () => {
    const intents = [
      ...Array.from({ length: 6 }, (_, index) => ({ id: `a${index}`, group: 'answerable' })),
      ...Array.from({ length: 6 }, (_, index) => ({ id: `u${index}`, group: 'unanswerable' })),
    ];

    const split = assignSplits(intents);
    const groups = (name) => new Set(split.filter((row) => row.split === name).map((row) => row.group));

    expect(groups('dev')).toEqual(new Set(['answerable', 'unanswerable']));
    expect(groups('locked')).toEqual(new Set(['answerable', 'unanswerable']));
    expect(split.filter((row) => row.split === 'locked').length).toBeGreaterThan(0);
  });
});
