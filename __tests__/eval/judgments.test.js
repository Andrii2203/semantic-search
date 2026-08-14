'use strict';

const { loadJudgments, isRelevant, isAnswerable } = require('../../src/eval/judgments');
const { loadCorpus, loadIntents } = require('../../src/eval/corpus-loader');
const { deriveCategory } = require('../../src/eval/categories');

const SPLITS = ['dev', 'locked'];
const GRADES = [0, 1, 2, 3];

describe('src/eval/judgments.js', () => {
  test('every judgment names an intent that exists and an article that exists', () => {
    const intentIds = new Set(loadIntents().map((intent) => intent.id));
    const articleIds = new Set(loadCorpus().map((article) => article.id));

    for (const judgment of loadJudgments()) {
      expect(intentIds.has(judgment.intentId)).toBe(true);
      expect(articleIds.has(judgment.articleId)).toBe(true);
    }
  });

  test('every judgment carries a grade of 0, 1, 2 or 3', () => {
    for (const judgment of loadJudgments()) {
      expect(GRADES).toContain(judgment.grade);
    }
  });

  test('every judgment records the judge model identifier and the prompt version', () => {
    for (const judgment of loadJudgments()) {
      expect(typeof judgment.model).toBe('string');
      expect(judgment.model.length).toBeGreaterThan(0);
      expect(Number.isInteger(judgment.promptVersion)).toBe(true);
    }
  });

  test('every intent carries a split of either dev or locked', () => {
    for (const intent of loadIntents()) {
      expect(SPLITS).toContain(intent.split);
    }
  });

  test('every derived category present in the judgments appears in both splits', () => {
    const articles = new Map(loadCorpus().map((article) => [article.id, article]));
    const splitOf = new Map(loadIntents().map((intent) => [intent.id, intent.split]));
    const seen = new Map();

    for (const judgment of loadJudgments()) {
      const category = deriveCategory(judgment, articles.get(judgment.articleId), judgment.properties);
      if (!seen.has(category)) {
        seen.set(category, new Set());
      }
      seen.get(category).add(splitOf.get(judgment.intentId));
    }

    for (const [category, splits] of seen) {
      for (const split of SPLITS) {
        expect({ category, split, present: splits.has(split) })
          .toEqual({ category, split, present: true });
      }
    }
  });

  test('no article in a snapshot has source equal to djinni', () => {
    for (const article of loadCorpus()) {
      expect(article.source).not.toBe('djinni');
    }
  });

  test('a pair with no judgment is reported as not relevant', () => {
    expect(isRelevant('intent-that-does-not-exist', 'article-that-does-not-exist')).toBe(false);
  });

  test('an intent with no article graded above zero is reported as unanswerable', () => {
    const judgments = loadJudgments();
    const graded = new Map();

    for (const judgment of judgments) {
      const best = graded.get(judgment.intentId) ?? 0;
      graded.set(judgment.intentId, Math.max(best, judgment.grade));
    }

    for (const [intentId, best] of graded) {
      expect(isAnswerable(intentId)).toBe(best > 0);
    }
  });

  test('both groups of intents are present, answerable and unanswerable', () => {
    const intents = loadIntents();
    const answerable = intents.filter((intent) => isAnswerable(intent.id));

    expect(answerable.length).toBeGreaterThan(0);
    expect(answerable.length).toBeLessThan(intents.length);
  });
});
