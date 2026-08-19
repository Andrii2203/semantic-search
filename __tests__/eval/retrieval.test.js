'use strict';

const {
  retrieve,
  reciprocalRankFusion,
  weightedFusion,
  queryTexts,
} = require('../../src/eval/retrieval');
const constants = require('../../src/search-constants');

const documents = [
  { id: 'lexical-hit', title: 'quarterly earnings', text: 'quarterly earnings rose across the group' },
  { id: 'dense-hit', title: 'profit report', text: 'the company made more money than last year' },
  { id: 'filler-one', title: 'weather', text: 'rain is expected along the coast on friday' },
  { id: 'filler-two', title: 'timetable', text: 'the branch line closes for maintenance in june' },
];

const query = 'quarterly earnings';

const vectors = {
  'lexical-hit': [0, 1, 0],
  'dense-hit': [1, 0, 0],
  'filler-one': [0, 0, 1],
  'filler-two': [0, 0, 1],
};

function embedder() {
  return (text) => {
    if (text === query) {
      return Promise.resolve([1, 0, 0]);
    }
    const document = documents.find((row) => text.startsWith(row.title));
    return Promise.resolve(vectors[document.id]);
  };
}

async function ids(configuration) {
  const index = await retrieve.prepare(documents, configuration, embedder());
  return retrieve.forQuery(index, query, configuration, 4);
}

const lexical = { branches: ['lexical'], fields: ['title', 'text'], bm25: {}, limit: 4 };
const dense = { branches: ['dense'], fields: ['title', 'text'], bm25: {}, limit: 4 };

describe('src/eval/retrieval.js', () => {
  test('a dense configuration ranks the whole corpus by vector similarity to the query', async () => {
    const ranking = await ids(dense);

    expect(ranking[0]).toBe('dense-hit');
    expect(ranking).toHaveLength(4);
  });

  test('a sequential configuration scores only the documents the lexical branch returned', async () => {
    const sequential = { ...lexical, branches: ['lexical', 'dense'], mode: 'sequential' };
    const ranking = await ids(sequential);

    expect(ranking).toContain('lexical-hit');
    expect(ranking).not.toContain('dense-hit');
  });

  test('a parallel configuration merges a lexical candidate list and a dense candidate list', async () => {
    const parallel = {
      ...lexical,
      branches: ['lexical', 'dense'],
      mode: 'parallel',
      fusion: 'rrf',
    };
    const ranking = await ids(parallel);

    expect(ranking).toContain('lexical-hit');
    expect(ranking).toContain('dense-hit');
  });

  test('reciprocal rank fusion merges two rankings by the reciprocal of the rank constant plus the rank', () => {
    const merged = reciprocalRankFusion([['a', 'b'], ['b', 'c']], constants.rrfK);
    const expected = 1 / (constants.rrfK + 1) + 1 / (constants.rrfK + 2);

    expect(merged[0]).toEqual({ id: 'b', score: expected });
    expect(merged.map((row) => row.id)).toEqual(['b', 'a', 'c']);
  });

  test('weighted fusion merges two rankings by normalised score at the configured weights', () => {
    const lexicalScores = [{ id: 'a', score: 10 }, { id: 'b', score: 0 }];
    const denseScores = [{ id: 'b', score: 1 }, { id: 'a', score: 0 }];
    const merged = weightedFusion([lexicalScores, denseScores], [0.9, 0.1]);

    expect(merged[0].id).toBe('a');
    expect(merged[0].score).toBeCloseTo(0.9, 10);
    expect(merged[1].score).toBeCloseTo(0.1, 10);
  });

  test('the retrieval path takes its embedder as an argument, so a run is reproducible without a model', async () => {
    const first = await ids(dense);
    const second = await ids(dense);

    expect(first).toEqual(second);
  });

  test('a configuration with no query transform sends the query text to both branches', () => {
    expect(queryTexts(lexical, 'what were the quarterly earnings')).toEqual({
      lexical: 'what were the quarterly earnings',
      dense: 'what were the quarterly earnings',
    });
  });

  test('a configuration whose lexical query is keywords sends the extracted keywords to the lexical branch and the query text to the dense branch', () => {
    const text = 'what were the quarterly earnings of the group';
    const texts = queryTexts({ ...lexical, lexicalQuery: 'keywords' }, text);

    expect(texts.dense).toBe(text);
    expect(texts.lexical.split(' ').sort()).toEqual(['earnings', 'group', 'quarterly']);
  });

  test('a configuration whose dense query is keywords sends the extracted keywords to the dense branch', () => {
    const text = 'what were the quarterly earnings of the group';
    const texts = queryTexts({ ...lexical, denseQuery: 'keywords' }, text);

    expect(texts.lexical).toBe(text);
    expect(texts.dense.split(' ').sort()).toEqual(['earnings', 'group', 'quarterly']);
  });

  test('the keyword transform uses the frequency extractor, so a run needs no language model and no key', async () => {
    const keywordLexical = { ...lexical, lexicalQuery: 'keywords', denseQuery: 'keywords' };
    const embed = jest.fn().mockResolvedValue([1, 0, 0]);
    const index = await retrieve.prepare(documents, { ...keywordLexical, branches: ['dense'] }, embed);
    await retrieve.forQuery(index, 'what are the quarterly earnings', { ...keywordLexical, branches: ['dense'] }, 4);

    expect(embed).toHaveBeenLastCalledWith('quarterly earnings', 'query');
  });

  test('a lexical configuration never calls the embedder', async () => {
    const embed = jest.fn();
    const index = await retrieve.prepare(documents, lexical, embed);
    retrieve.forQuery(index, query, lexical, 4);

    expect(embed).not.toHaveBeenCalled();
  });
});
