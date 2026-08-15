'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { runConfiguration, CONFIGURATIONS } = require('../../src/eval/harness');
const { CATEGORIES } = require('../../src/eval/categories');

const richCorpus = [
  {
    _id: 'rich1',
    title: 'Vitamin supplementation and bone density',
    text:
      'A randomised trial of vitamin supplementation measured bone density in older adults across ' +
      'twelve clinical sites during winter. Participants received either a daily dose or a placebo, ' +
      'and researchers tracked fracture incidence, calcium absorption and mobility scores throughout ' +
      'the follow up period. The authors report modest gains concentrated among people whose ' +
      'baseline levels were lowest before enrolment began.',
  },
  {
    _id: 'rich2',
    title: 'Coastal erosion on the northern shore',
    text:
      'Sediment transport along the northern shore reshaped the beach over a decade, according to a ' +
      'survey combining aerial photography with tide gauge records. Planners now expect the dune ' +
      'line to retreat further unless the groynes are replaced, and the council commissioned a ' +
      'second study covering the estuary and its shifting channels before any permission is granted.',
  },
];

const richQueries = [{ _id: 'rq1', text: 'vitamin supplementation and bone density in older adults' }];

const richQrels = ['query-id\tcorpus-id\tscore', 'rq1\trich1\t3', 'rq1\trich2\t0'].join('\n');

const corpus = [
  { _id: 'doc1', title: 'Vitamin D and bone density', text: 'A randomised trial of vitamin supplementation measured bone density in older adults.' },
  { _id: 'doc2', title: 'Coastal erosion', text: 'Sediment transport along the northern shore reshaped the beach over a decade.' },
  { _id: 'doc3', title: 'Filler', text: 'Unrelated text about railway timetables and rolling stock.' },
];

const queries = [
  { _id: 'q1', text: 'vitamin supplementation and bone density' },
  { _id: 'q2', text: 'sediment transport coastal erosion' },
];

const qrels = ['query-id\tcorpus-id\tscore', 'q1\tdoc1\t2', 'q2\tdoc2\t2'].join('\n');

function writeDataset(root, name, dataset = {}) {
  const { rows = corpus, asked = queries, judged = qrels } = dataset;
  const directory = path.join(root, name);
  fs.mkdirSync(path.join(directory, 'qrels'), { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'corpus.jsonl'),
    rows.map((row) => JSON.stringify(row)).join('\n'),
  );
  fs.writeFileSync(
    path.join(directory, 'queries.jsonl'),
    asked.map((row) => JSON.stringify(row)).join('\n'),
  );
  fs.writeFileSync(path.join(directory, 'qrels', 'test.tsv'), judged);
}

describe('src/eval/harness.js', () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'));
    writeDataset(root, 'tiny');
    writeDataset(root, 'rich', { rows: richCorpus, asked: richQueries, judged: richQrels });
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('the harness scores a named configuration over a whole dataset and returns one row per metric', async () => {
    const result = await runConfiguration({ configuration: 'bm25-beir-baseline', dataset: 'tiny', root });

    expect(result.configuration).toBe('bm25-beir-baseline');
    expect(result.dataset).toBe('tiny');
    expect(result.queries).toBe(2);
    expect(result.metrics.map((row) => row.name)).toEqual(['nDCG@10', 'Recall@100']);
    for (const row of result.metrics) {
      expect(row.value).toBeGreaterThanOrEqual(0);
      expect(row.value).toBeLessThanOrEqual(1);
    }
  });

  test('the harness refuses to run when the requested dataset is absent, naming the fetch command', async () => {
    await expect(runConfiguration({ configuration: 'bm25-beir-baseline', dataset: 'scifact', root }))
      .rejects.toThrow(/scripts\/fetch-beir\.js scifact/);
  });

  test('the harness refuses a configuration it does not know, naming the ones it knows', async () => {
    await expect(runConfiguration({ configuration: 'invented', dataset: 'tiny', root }))
      .rejects.toThrow(/bm25-beir-baseline/);
  });

  test('the baseline configuration carries the parameters the published number was produced at', () => {
    expect(CONFIGURATIONS['bm25-beir-baseline'].bm25).toEqual({ k1: 0.9, b: 0.4 });
    expect(CONFIGURATIONS['bm25-beir-baseline'].fields).toEqual(['title', 'text']);
  });

  test('the harness reports one metric value per query alongside the mean', async () => {
    const result = await runConfiguration({ configuration: 'bm25-beir-baseline', dataset: 'tiny', root });
    const perQuery = result.perQuery['nDCG@10'];

    expect(perQuery.map((row) => row.queryId)).toEqual(['q1', 'q2']);
    expect(perQuery.every((row) => typeof row.value === 'number')).toBe(true);
    expect(result.metrics[0].value).toBeCloseTo(
      perQuery.reduce((total, row) => total + row.value, 0) / perQuery.length,
      10,
    );
  });

  test('a retrieval that ranks the judged document first scores one', async () => {
    const result = await runConfiguration({ configuration: 'bm25-beir-baseline', dataset: 'tiny', root });
    expect(result.metrics[0].value).toBeCloseTo(1, 10);
  });

  test('a dense configuration is scored with an injected embedder and no model', async () => {
    const embed = (text) => Promise.resolve(text.includes('Vitamin') ? [1, 0] : [0, 1]);
    const result = await runConfiguration({
      configuration: 'dense-only',
      dataset: 'tiny',
      root,
      embed,
    });

    expect(result.queries).toBe(2);
    expect(result.metrics[0].name).toBe('nDCG@10');
  });

  test('every judgment in a report carries a derived category, computed at report time from the grade, the overlap and the article properties', async () => {
    const result = await runConfiguration({ configuration: 'bm25-beir-baseline', dataset: 'rich', root });

    expect(Object.keys(result.categories).sort()).toEqual([...CATEGORIES].sort());
    expect(result.categorised.length).toBeGreaterThan(0);

    for (const row of result.categorised) {
      expect(CATEGORIES).toContain(row.category);
      expect(typeof row.overlap).toBe('number');
      expect(typeof row.grade).toBe('number');
    }

    const counted = Object.values(result.categories).reduce((total, count) => total + count, 0);
    expect(counted).toBe(result.categorised.length);

    const judged = result.categorised.find((row) => row.documentId === 'rich1');
    expect(judged.grade).toBe(3);
    expect(judged.category).toBe('relevant');
  });

  test('the harness reports counts per category, not one averaged number', async () => {
    const result = await runConfiguration({ configuration: 'bm25-beir-baseline', dataset: 'rich', root });

    expect(result.categories.relevant).toBe(1);
    for (const category of CATEGORIES) {
      expect(typeof result.categories[category]).toBe('number');
    }
  });
});
