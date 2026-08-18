'use strict';

const path = require('path');

const constants = require('../search-constants');
const { loadDataset, DEFAULT_ROOT } = require('./beir-loader');
const {
  buildDocumentFrequency,
  deriveCategory,
  lexicalOverlap,
  CATEGORIES,
} = require('./categories');
const { embedMany, embedOne, loadVectors, saveVectors } = require('./embedder');
const { ndcgAtK, recallAtK } = require('./metrics');
const { retrieve } = require('./retrieval');
const { rerankRanking } = require('./rerank');

const LEXICAL_FIELDS = ['title', 'text'];
const TEXT_ONLY = ['text'];

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

CONFIGURATIONS['bm25-query-keywords'] = {
  ...CONFIGURATIONS['bm25-repository-defaults'],
  lexicalQuery: 'keywords',
};

CONFIGURATIONS['parallel-weighted-query-keywords'] = {
  ...CONFIGURATIONS['parallel-weighted'],
  lexicalQuery: 'keywords',
};

CONFIGURATIONS['parallel-weighted-query-keywords-both'] = {
  ...CONFIGURATIONS['parallel-weighted'],
  lexicalQuery: 'keywords',
  denseQuery: 'keywords',
};

CONFIGURATIONS['dense-query-keywords'] = {
  ...CONFIGURATIONS['dense-only'],
  denseQuery: 'keywords',
};

CONFIGURATIONS['bm25-text-only'] = {
  ...CONFIGURATIONS['bm25-repository-defaults'],
  fields: TEXT_ONLY,
};

CONFIGURATIONS['parallel-weighted-text-only'] = {
  ...CONFIGURATIONS['parallel-weighted'],
  fields: TEXT_ONLY,
};

CONFIGURATIONS['bm25-reranked'] = {
  ...CONFIGURATIONS['bm25-repository-defaults'],
  rerankDepth: constants.rerankDepth,
};

CONFIGURATIONS['parallel-weighted-reranked'] = {
  ...CONFIGURATIONS['parallel-weighted'],
  rerankDepth: constants.rerankDepth,
};

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

function documentTexts(dataset, configuration) {
  return new Map(
    dataset.documents.map((document) => [
      document.id,
      configuration.fields.map((field) => document[field] || '').join(' '),
    ]),
  );
}

function categoriseRanking(context) {
  const { queryId, queryText, ranking, texts, judgments, frequency } = context;

  return ranking.slice(0, constants.evaluationK).map((documentId) => {
    const content = texts.get(documentId) || '';
    const overlap = lexicalOverlap(queryText, content, frequency);
    const grade = judgments[documentId] ?? 0;

    return {
      queryId,
      documentId,
      grade,
      overlap,
      category: deriveCategory({ grade }, { id: documentId, content }, { overlap }),
    };
  });
}

function countCategories(rows) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  for (const row of rows) {
    counts[row.category] += 1;
  }
  return counts;
}

/* istanbul ignore next */
async function cachedVectors(dataset, configuration, root, onProgress) {
  const directory = path.join(root || DEFAULT_ROOT, dataset.name);
  const ids = dataset.documents.map((document) => document.id);
  const cached = loadVectors(directory, ids, configuration.fields);

  if (cached) {
    return cached;
  }

  const texts = dataset.documents.map((document) =>
    configuration.fields.map((field) => document[field] || '').join(' '),
  );
  const vectors = await embedMany(texts, onProgress);
  saveVectors(directory, ids, vectors, configuration.fields);

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

/* istanbul ignore next */
function crossEncoderScorer() {
  return require('../cross-encoder').scoreAll;
}

function resolveScorer(options) {
  return options.rerankScorer || crossEncoderScorer();
}

async function runConfiguration(options) {
  const { configuration: name, dataset: requested, root } = options;
  const configuration = resolveConfiguration(name);
  const dataset = typeof requested === 'string' ? loadDataset(requested, { root }) : requested;
  const index = await prepareIndex(dataset, configuration, options);

  const texts = documentTexts(dataset, configuration);
  const frequency = buildDocumentFrequency([...texts.values()].map((content) => ({ content })));

  const scorer = configuration.rerankDepth ? resolveScorer(options) : null;

  const scored = [];
  const categorised = [];
  for (const query of dataset.queries) {
    const judgments = Object.fromEntries(dataset.qrels.get(query.id));
    const fused = await retrieve.forQuery(index, query.text, configuration, constants.evaluationRecallK);
    const ranking = await rerankRanking({
      ranking: fused,
      queryText: query.text,
      texts,
      scorer,
      depth: configuration.rerankDepth,
    });

    scored.push({
      id: query.id,
      ndcg: ndcgAtK(ranking, judgments, constants.evaluationK),
      recall: recallAtK(ranking, judgments, constants.evaluationRecallK),
    });
    categorised.push(
      ...categoriseRanking({
        queryId: query.id,
        queryText: query.text,
        ranking,
        texts,
        judgments,
        frequency,
      }),
    );
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
    categories: countCategories(categorised),
    categorised,
  };
}

module.exports = { runConfiguration, CONFIGURATIONS };
