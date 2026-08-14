'use strict';

const constants = require('../search-constants');
const { loadDataset } = require('./beir-loader');
const { buildIndex, score } = require('./bm25');
const { ndcgAtK, recallAtK } = require('./metrics');

const CONFIGURATIONS = {
  'bm25-beir-baseline': {
    bm25: { k1: constants.beirBaselineK1, b: constants.beirBaselineB },
    fields: ['title', 'text'],
    multifield: true,
  },
  'bm25-repository-defaults': {
    bm25: { k1: constants.bm25K1, b: constants.bm25B },
    fields: ['title', 'text'],
    multifield: false,
  },
};

function textOf(document, fields) {
  return fields.map((field) => document[field] || '').join(' ');
}

function buildIndexes(documents, configuration) {
  if (!configuration.multifield) {
    return [buildIndex(documents.map((document) => ({ content: textOf(document, configuration.fields) })))];
  }

  return configuration.fields.map((field) =>
    buildIndex(documents.map((document) => ({ content: document[field] || '' }))),
  );
}

function rank(indexes, queryText, configuration, limit) {
  const totals = new Map();

  for (const index of indexes) {
    for (const [position, value] of score(index, queryText, configuration.bm25)) {
      totals.set(position, (totals.get(position) || 0) + value);
    }
  }

  return [...totals.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, limit)
    .map(([position]) => position);
}

function resolveConfiguration(name) {
  const configuration = CONFIGURATIONS[name];
  if (!configuration) {
    throw new Error(
      `unknown configuration ${name}. Known configurations: ${Object.keys(CONFIGURATIONS).join(', ')}`,
    );
  }
  return configuration;
}

function scoreQuery(context, query) {
  const { dataset, indexes, configuration } = context;
  const judgments = Object.fromEntries(dataset.qrels.get(query.id));
  const positions = rank(indexes, query.text, configuration, constants.evaluationRecallK);
  const ranking = positions.map((position) => dataset.documents[position].id);

  return {
    ndcg: ndcgAtK(ranking, judgments, constants.evaluationK),
    recall: recallAtK(ranking, judgments, constants.evaluationRecallK),
  };
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function runConfiguration({ configuration: name, dataset: datasetName, root }) {
  const configuration = resolveConfiguration(name);
  const dataset = loadDataset(datasetName, { root });
  const indexes = buildIndexes(dataset.documents, configuration);
  const context = { dataset, indexes, configuration };

  const scored = dataset.queries.map((query) => ({ ...scoreQuery(context, query), id: query.id }));
  const ndcgName = `nDCG@${constants.evaluationK}`;
  const recallName = `Recall@${constants.evaluationRecallK}`;

  const perQuery = {
    [ndcgName]: scored.map((row) => ({ queryId: row.id, value: row.ndcg })),
    [recallName]: scored.map((row) => ({ queryId: row.id, value: row.recall })),
  };

  return {
    configuration: name,
    dataset: datasetName,
    queries: dataset.queries.length,
    metrics: [
      { name: ndcgName, value: mean(scored.map((row) => row.ndcg)) },
      { name: recallName, value: mean(scored.map((row) => row.recall)) },
    ],
    perQuery,
  };
}

module.exports = { runConfiguration, CONFIGURATIONS };
