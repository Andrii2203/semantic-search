'use strict';

const { rerankRanking } = require('../../src/eval/rerank');
const { runConfiguration } = require('../../src/eval/harness');

const texts = new Map([
  ['a', 'first document'],
  ['b', 'second document'],
  ['c', 'third document'],
  ['d', 'fourth document'],
]);

const ranking = ['a', 'b', 'c', 'd'];

function scorerFrom(scores) {
  return (query, documents) => Promise.resolve(documents.map((text) => scores[text]));
}

describe('src/eval/rerank.js', () => {
  test('a configuration with no reranker returns the fused ranking unchanged', async () => {
    const scorer = jest.fn();
    const result = await rerankRanking({ ranking, queryText: 'q', texts, scorer, depth: 0 });

    expect(result).toEqual(ranking);
    expect(scorer).not.toHaveBeenCalled();
  });

  test('a configuration with a reranker reorders the top of the ranking and leaves the rest in place', async () => {
    const scorer = scorerFrom({ 'first document': 1, 'second document': 5, 'third document': 3 });
    const result = await rerankRanking({ ranking, queryText: 'q', texts, scorer, depth: 3 });

    expect(result).toEqual(['b', 'c', 'a', 'd']);
  });

  test('the reranker takes its scorer as an argument, so a run is reproducible without a model', async () => {
    const scorer = scorerFrom({ 'first document': 1, 'second document': 5, 'third document': 3 });
    const first = await rerankRanking({ ranking, queryText: 'q', texts, scorer, depth: 3 });
    const second = await rerankRanking({ ranking, queryText: 'q', texts, scorer, depth: 3 });

    expect(first).toEqual(second);
  });

  test('reranking at a depth at or below the recall cutoff leaves Recall@100 unchanged', async () => {
    const documents = [
      { id: 'hit', title: 'quarterly earnings', text: 'quarterly earnings rose across the group' },
      { id: 'miss-one', title: 'weather', text: 'rain is expected along the coast' },
      { id: 'miss-two', title: 'timetable', text: 'the branch line closes in june' },
    ];
    const dataset = {
      name: 'rerank-fixture',
      documents,
      queries: [{ id: 'q1', text: 'quarterly earnings' }],
      qrels: new Map([['q1', new Map([['hit', 3]])]]),
    };
    const embed = () => Promise.resolve([1, 0, 0]);
    const reversing = (query, contents) => Promise.resolve(contents.map((_, index) => index));

    const plain = await runConfiguration({ configuration: 'bm25-repository-defaults', dataset, embed });
    const reranked = await runConfiguration({
      configuration: 'bm25-reranked',
      dataset,
      embed,
      rerankScorer: reversing,
    });

    const recallOf = (result) => result.metrics.find((metric) => metric.name.startsWith('Recall')).value;
    expect(recallOf(reranked)).toBe(recallOf(plain));
  });
});
