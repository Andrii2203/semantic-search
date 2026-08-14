'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadDataset, describeDataset } = require('../../src/eval/beir-loader');

const corpus = [
  { _id: 'doc1', title: 'Vitamin D and bone density', text: 'A trial of supplementation in adults.' },
  { _id: 'doc2', title: 'Coastal erosion', text: 'Sediment transport along the northern shore.' },
  { _id: 'doc3', title: 'Unjudged filler', text: 'Nothing in the answer key points at this one.' },
];

const queries = [
  { _id: 'q1', text: 'does vitamin D improve bone density' },
  { _id: 'q2', text: 'what drives coastal erosion' },
  { _id: 'q3', text: 'a query nobody judged, from the training split' },
];

const qrels = ['query-id\tcorpus-id\tscore', 'q1\tdoc1\t2', 'q1\tdoc2\t0', 'q2\tdoc2\t1'].join('\n');

function writeDataset(root, name, rows) {
  const directory = path.join(root, name);
  fs.mkdirSync(path.join(directory, 'qrels'), { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'corpus.jsonl'),
    rows.corpus.map((row) => JSON.stringify(row)).join('\n'),
  );
  fs.writeFileSync(
    path.join(directory, 'queries.jsonl'),
    rows.queries.map((row) => JSON.stringify(row)).join('\n'),
  );
  fs.writeFileSync(path.join(directory, 'qrels', 'test.tsv'), rows.qrels);
  return directory;
}

describe('src/eval/beir-loader.js', () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'beir-'));
    writeDataset(root, 'tiny', { corpus, queries, qrels });
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('the loader reads a dataset from disk and performs no network request', () => {
    const original = global.fetch;
    global.fetch = () => {
      throw new Error('the loader reached the network');
    };

    try {
      const dataset = loadDataset('tiny', { root });
      expect(dataset.documents).toHaveLength(3);
    } finally {
      global.fetch = original;
    }
  });

  test('the loader reports the document count, the query count and the judgment count', () => {
    const counts = describeDataset(loadDataset('tiny', { root }));
    expect(counts).toEqual({ documents: 3, queries: 2, judgments: 3 });
  });

  test('every query in a loaded dataset has at least one relevance judgment', () => {
    const dataset = loadDataset('tiny', { root });

    expect(dataset.queries.map((query) => query.id)).toEqual(['q1', 'q2']);
    for (const query of dataset.queries) {
      expect(dataset.qrels.get(query.id).size).toBeGreaterThan(0);
    }
  });

  test('every judged document identifier exists in the corpus of the same dataset', () => {
    const broken = { corpus, queries, qrels: `${qrels}\nq2\tmissing-doc\t1` };
    writeDataset(root, 'broken', broken);

    expect(() => loadDataset('broken', { root })).toThrow(/missing-doc/);
  });

  test('the loader refuses an absent dataset and names the fetch command', () => {
    expect(() => loadDataset('nfcorpus', { root })).toThrow(/scripts\/fetch-beir\.js nfcorpus/);
  });

  test('a judgment of grade zero is loaded rather than dropped', () => {
    const dataset = loadDataset('tiny', { root });
    expect(dataset.qrels.get('q1').get('doc2')).toBe(0);
  });
});
