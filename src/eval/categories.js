'use strict';

const constants = require('../search-constants');
const { isKeywordStuffed } = require('../junk-filter');

const CATEGORIES = [
  'relevant',
  'semantic',
  'partial',
  'irrelevant',
  'trap',
  'spam',
  'duplicate',
  'thin',
];

const STOP_WORDS = new Set(
  ('the a an and or but in on at to for of with by from is are was were be been this that it its as ' +
    'we you they has have had will would can new more most all about how why what when said')
    .split(' '),
);

function contentWords(text) {
  const found = (text || '').toLowerCase().match(/[a-z]{3,}/g) || [];
  return new Set(found.filter((word) => !STOP_WORDS.has(word)));
}

function buildDocumentFrequency(articles) {
  const frequency = new Map();
  for (const article of articles) {
    for (const word of contentWords(article.content)) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
  }
  frequency.set('__documents__', articles.length);
  return frequency;
}

function inverseDocumentFrequency(word, frequency) {
  if (!frequency) {
    return 1;
  }
  const documents = frequency.get('__documents__') || 1;
  return Math.log((documents + 1) / ((frequency.get(word) || 0) + 1));
}

function lexicalOverlap(intentText, articleText, frequency = null) {
  const intent = contentWords(intentText);
  const article = contentWords(articleText);
  if (intent.size === 0 || article.size === 0) {
    return 0;
  }

  let shared = 0;
  let total = 0;
  for (const word of intent) {
    const weight = inverseDocumentFrequency(word, frequency);
    total += weight;
    if (article.has(word)) {
      shared += weight;
    }
  }

  return total === 0 ? 0 : shared / total;
}

function countWords(text) {
  return (text || '').split(/\s+/).filter(Boolean).length;
}

function articleProperty(article) {
  if (!article) {
    return null;
  }
  if (countWords(article.content) < constants.thinArticleWords) {
    return 'thin';
  }
  if (isKeywordStuffed(article.content)) {
    return 'spam';
  }
  return null;
}

function gradeCategory(grade, overlap) {
  if (grade >= constants.gradeRelevantThreshold) {
    return overlap < constants.semanticOverlapThreshold ? 'semantic' : 'relevant';
  }
  if (grade === 0) {
    return overlap >= constants.trapOverlapThreshold ? 'trap' : 'irrelevant';
  }
  return 'partial';
}

function deriveCategory(judgment, article, properties = {}) {
  if (properties.isDuplicate) {
    return 'duplicate';
  }

  const byArticle = articleProperty(article);
  if (byArticle) {
    return byArticle;
  }

  return gradeCategory(judgment.grade, properties.overlap ?? 0);
}

module.exports = {
  deriveCategory,
  lexicalOverlap,
  buildDocumentFrequency,
  countWords,
  CATEGORIES,
};
