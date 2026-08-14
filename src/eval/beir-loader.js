'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.join(__dirname, '..', '..', 'eval', 'beir');

function fetchCommand(name) {
  return `node scripts/fetch-beir.js ${name}`;
}

function readJsonLines(file) {
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function readQrels(file) {
  const rows = fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.split('\t'))
    .filter(([queryId]) => queryId !== 'query-id');

  const qrels = new Map();
  for (const [queryId, documentId, grade] of rows) {
    if (!qrels.has(queryId)) {
      qrels.set(queryId, new Map());
    }
    qrels.get(queryId).set(documentId, Number(grade));
  }

  return qrels;
}

function assertJudgedDocumentsExist(qrels, documentIds, name) {
  for (const [queryId, judgments] of qrels) {
    for (const documentId of judgments.keys()) {
      if (!documentIds.has(documentId)) {
        throw new Error(
          `dataset ${name} judges ${documentId} for query ${queryId}, which is not in its corpus`,
        );
      }
    }
  }
}

function datasetDirectory(name, options) {
  const directory = path.join(options.root || DEFAULT_ROOT, name);
  if (!fs.existsSync(directory)) {
    throw new Error(`dataset ${name} is not on disk at ${directory}. Run: ${fetchCommand(name)}`);
  }
  return directory;
}

function loadDataset(name, options = {}) {
  const directory = datasetDirectory(name, options);

  const documents = readJsonLines(path.join(directory, 'corpus.jsonl')).map((row) => ({
    id: row._id,
    title: row.title || '',
    text: row.text || '',
  }));

  const qrels = readQrels(path.join(directory, 'qrels', 'test.tsv'));
  assertJudgedDocumentsExist(qrels, new Set(documents.map((document) => document.id)), name);

  const queries = readJsonLines(path.join(directory, 'queries.jsonl'))
    .filter((row) => qrels.has(row._id))
    .map((row) => ({ id: row._id, text: row.text || '' }));

  return { name, documents, queries, qrels };
}

function describeDataset(dataset) {
  const judgments = [...dataset.qrels.values()].reduce((total, row) => total + row.size, 0);

  return { documents: dataset.documents.length, queries: dataset.queries.length, judgments };
}

module.exports = { loadDataset, describeDataset, fetchCommand, DEFAULT_ROOT };
