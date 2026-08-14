'use strict';

const fs = require('fs');
const path = require('path');
const constants = require('../search-constants');
const { EVAL_DIR } = require('./corpus-loader');

const JUDGMENTS_FILE = path.join(EVAL_DIR, 'judgments.json');

function loadJudgments() {
  if (!fs.existsSync(JUDGMENTS_FILE)) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(JUDGMENTS_FILE, 'utf8'));
  return payload.items || [];
}

function saveJudgments(items) {
  const sorted = [...items].sort(
    (a, b) => a.intentId.localeCompare(b.intentId) || a.articleId.localeCompare(b.articleId),
  );
  fs.mkdirSync(path.dirname(JUDGMENTS_FILE), { recursive: true });
  fs.writeFileSync(JUDGMENTS_FILE, `${JSON.stringify({ items: sorted }, null, 2)}\n`);
  return sorted.length;
}

function gradeOf(intentId, articleId) {
  const found = loadJudgments().find(
    (judgment) => judgment.intentId === intentId && judgment.articleId === articleId,
  );
  return found ? found.grade : null;
}

function isRelevant(intentId, articleId) {
  const grade = gradeOf(intentId, articleId);
  return grade !== null && grade >= constants.gradeRelevantThreshold;
}

function bestGradeFor(intentId) {
  let best = 0;
  for (const judgment of loadJudgments()) {
    if (judgment.intentId === intentId && judgment.grade > best) {
      best = judgment.grade;
    }
  }
  return best;
}

function isAnswerable(intentId) {
  return bestGradeFor(intentId) > 0;
}

module.exports = {
  loadJudgments,
  saveJudgments,
  gradeOf,
  isRelevant,
  isAnswerable,
  bestGradeFor,
  JUDGMENTS_FILE,
};
