'use strict';

const fs = require('fs');
const path = require('path');

const constants = require('../search-constants');
const { loadCorpus, loadIntents, EVAL_DIR } = require('./corpus-loader');

function readJudgments() {
  const file = path.join(EVAL_DIR, 'judgments.json');
  if (!fs.existsSync(file)) {
    throw new Error(`the answer key is missing at ${file}. Run: node scripts/judge-pool.js`);
  }

  return JSON.parse(fs.readFileSync(file, 'utf-8')).items || [];
}

function asDocument(item) {
  return {
    id: item.id,
    title: (item.metadata && item.metadata.title) || '',
    text: item.content || '',
  };
}

function asQuery(intent) {
  const title = (intent.metadata && intent.metadata.title) || '';
  const body = intent.content || '';

  return { id: intent.id, text: body.startsWith(title) ? body : `${title} ${body}`.trim() };
}

function groupJudgments(rows, documentIds) {
  const qrels = new Map();

  for (const row of rows) {
    if (!documentIds.has(row.articleId)) {
      continue;
    }
    if (!qrels.has(row.intentId)) {
      qrels.set(row.intentId, new Map());
    }
    qrels.get(row.intentId).set(row.articleId, row.grade);
  }

  return qrels;
}

function isAnswerable(judgments) {
  return [...judgments.values()].some((grade) => grade >= constants.gradeRelevantThreshold);
}

function loadLocalDataset(options = {}) {
  const split = options.split || 'dev';
  const documents = loadCorpus().map(asDocument);
  const documentIds = new Set(documents.map((document) => document.id));
  const qrels = groupJudgments(readJudgments(), documentIds);

  const inSplit = loadIntents().filter((intent) => intent.split === split && qrels.has(intent.id));
  const answerable = inSplit.filter((intent) => isAnswerable(qrels.get(intent.id)));

  return {
    name: 'local-news',
    split,
    documents,
    queries: answerable.map(asQuery),
    qrels: new Map(answerable.map((intent) => [intent.id, qrels.get(intent.id)])),
    answerable: answerable.length,
    unanswerable: inSplit.length - answerable.length,
    judgedIntents: inSplit.length,
  };
}

module.exports = { loadLocalDataset };
