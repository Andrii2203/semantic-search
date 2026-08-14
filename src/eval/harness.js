'use strict';

const path = require('path');

const constants = require('../search-constants');
const { loadDataset, DEFAULT_ROOT } = require('./beir-loader');
const { embedMany, embedOne, loadVectors, saveVectors } = require('./embedder');
const { ndcgAtK, recallAtK } = require('./metrics');
const { retrieve } = require('./retrieval');

const LEXICAL_FIELDS = ['title', 'text'];

const CONFIGURATIONS = {
  'bm25-beir-baseline': {
    bm25: { k1: constants.beirBaselineK1, b: constants.beirBaselineB },
    fields: LEXICAL_FIELDS,
    multifield: true,
    branches: ['lexical'],
  },
  'bm25-repository-defaults': {
    bm25: { k1: constants.bm25K1, b: constants.bm25B },
    fields: LEXICAL_FIELDS,
    multifield: false,
    branches: ['lexical'],
  },
  'dense-only': {
    bm25: {},
    fields: LEXICAL_FIELDS,
    multifield: false,
    branches: ['dense'],
  },
  'sequential-rescore': {
    bm25: { k1: constants.bm25K1, b: constants.bm25B },
    fields: LEXICAL_FIELDS,
    multifield: false,
    branches: ['lexical', 'dense'],
    mode: 'sequential',
    limit: constants.candidateLimitBm25,
  },
  'parallel-rrf': {
    bm25: { k1: constants.bm25K1, b: constants.bm25B },
    fields: LEXICAL_FIELDS,
    multifield: false,
    branches: ['lexical', 'dense'],
    mode: 'parallel',
    fusion: 'rrf',
    limit: constants.candidateLimitBm25,
  },
  'parallel-weighted': {
    bm25: { k1: constants.bm25K1, b: constants.bm25B },
    fields: LEXICAL_FIELDS,
    multifield: false,
    branches: ['lexical', 'dense'],
    mode: 'parallel',
    fusion: 'weighted',
    limit: constants.candidateLimitBm25,
  },
};

function parallelVariant(extra) {
  return { ...CONFIGURATIONS['parallel-rrf'], ...extra };
}

for (const rankConstant of [10, 20, 60, 100, 200]) {
  CONFIGURATIONS[`parallel-rrf-k${rankConstant}`] = parallelVariant({ rankConstant });
}

for (const lexicalWeight of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
  const name = `parallel-weighted-${Math.round(lexicalWeight * 100)}`;
  CONFIGURATIONS[name] = parallelVariant({
    fusion: 'weighted',
    weights: [lexicalWeight, 1 - lexicalWeight],
  });
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

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

/* istanbul ignore next */
async function cachedVectors(dataset, configuration, root, onProgress) {
  const directory = path.join(root || DEFAULT_ROOT, dataset.name);
  const ids = dataset.documents.map((document) => document.id);
  const cached = loadVectors(directory, ids);

  if (cached) {
    return cached;
  }

  const texts = dataset.documents.map((document) =>
    configuration.fields.map((field) => document[field] || '').join(' '),
  );
  const vectors = await embedMany(texts, onProgress);
  saveVectors(directory, ids, vectors);

  return new Map(ids.map((id, index) => [id, vectors[index]]));
}

async function prepareIndex(dataset, configuration, options) {
  const embed = options.embed || embedOne;

  if (!configuration.branches.includes('dense')) {
    return retrieve.prepare(dataset.documents, configuration, embed);
  }

  const vectors = options.embed
    ? null
    : await cachedVectors(dataset, configuration, options.root, options.onProgress);

  return retrieve.prepare(dataset.documents, configuration, embed, vectors);
}

async function runConfiguration(options) {
  const { configuration: name, dataset: requested, root } = options;
  const configuration = resolveConfiguration(name);
  const dataset = typeof requested === 'string' ? loadDataset(requested, { root }) : requested;
  const index = await prepareIndex(dataset, configuration, options);

  const scored = [];
  for (const query of dataset.queries) {
    const judgments = Object.fromEntries(dataset.qrels.get(query.id));
    const ranking = await retrieve.forQuery(index, query.text, configuration, constants.evaluationRecallK);

    scored.push({
      id: query.id,
      ndcg: ndcgAtK(ranking, judgments, constants.evaluationK),
      recall: recallAtK(ranking, judgments, constants.evaluationRecallK),
    });
  }

  const ndcgName = `nDCG@${constants.evaluationK}`;
  const recallName = `Recall@${constants.evaluationRecallK}`;

  return {
    configuration: name,
    dataset: dataset.name,
    queries: dataset.queries.length,
    metrics: [
      { name: ndcgName, value: mean(scored.map((row) => row.ndcg)) },
      { name: recallName, value: mean(scored.map((row) => row.recall)) },
    ],
    perQuery: {
      [ndcgName]: scored.map((row) => ({ queryId: row.id, value: row.ndcg })),
      [recallName]: scored.map((row) => ({ queryId: row.id, value: row.recall })),
    },
  };
}

module.exports = { runConfiguration, CONFIGURATIONS };
