'use strict';

// The one task that needs a person. Shows an intent and an article, takes one key, 0 to 3.
//
//   node scripts/calibrate.js
//
// The judge's grade is never shown, otherwise the agreement statistic measures nothing. Progress is
// saved after every answer, so quitting and returning is safe. When the sample is complete the
// script computes Cohen's kappa between the two sets of labels.
//
// See docs/plans/evaluation-corpus.md section 9.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadCorpus, loadIntents, EVAL_DIR } = require('../src/eval/corpus-loader');
const { loadJudgments } = require('../src/eval/judgments');
const constants = require('../src/search-constants');

const FILE = path.join(EVAL_DIR, 'calibration.json');
const INTENT_PREVIEW = constants.judgeIntentChars;
const ARTICLE_PREVIEW = constants.judgeArticleChars;

function load() {
  if (!fs.existsSync(FILE)) {
    return { items: [] };
  }
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(payload) {
  fs.writeFileSync(FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

function stratifiedSample(judgments, size) {
  const byGrade = new Map();
  for (const judgment of judgments) {
    if (!byGrade.has(judgment.grade)) {
      byGrade.set(judgment.grade, []);
    }
    byGrade.get(judgment.grade).push(judgment);
  }

  const perGrade = Math.ceil(size / byGrade.size);
  const sample = [];

  for (const [, group] of [...byGrade.entries()].sort((a, b) => a[0] - b[0])) {
    const step = Math.max(1, Math.floor(group.length / perGrade));
    for (let i = 0; i < group.length && sample.length < size; i += step) {
      sample.push({ intentId: group[i].intentId, articleId: group[i].articleId });
    }
  }

  return sample.slice(0, size);
}

function cohensKappa(pairs) {
  const grades = [0, 1, 2, 3];
  const total = pairs.length;
  let agreed = 0;
  const mine = new Map();
  const theirs = new Map();

  for (const [human, judge] of pairs) {
    if (human === judge) {
      agreed++;
    }
    mine.set(human, (mine.get(human) || 0) + 1);
    theirs.set(judge, (theirs.get(judge) || 0) + 1);
  }

  const observed = agreed / total;
  let expected = 0;
  for (const grade of grades) {
    expected += ((mine.get(grade) || 0) / total) * ((theirs.get(grade) || 0) / total);
  }

  return expected === 1 ? 1 : (observed - expected) / (1 - expected);
}

function render(intent, article, position, total) {
  console.clear();
  console.log(`Calibration ${position} of ${total}\n`);
  console.log('THE PERSON IS INTERESTED IN');
  console.log(`${intent.content.slice(0, INTENT_PREVIEW)}\n`);
  console.log(`ARTICLE: ${article.metadata?.title || ''}`);
  console.log(`${article.content.slice(0, ARTICLE_PREVIEW)}`);
  if (article.content.length > ARTICLE_PREVIEW) {
    console.log(`[cut here, as it was for the judge. ${article.content.length - ARTICLE_PREVIEW} characters follow that neither of you sees]`);
  }
  console.log('');
  console.log('  3  squarely about what the person is interested in');
  console.log('  2  same subject, seen from a different angle');
  console.log('  1  related subject, does not address the interest');
  console.log('  0  a different subject');
  console.log('  q  stop and keep what is done\n');
}

function askKey() {
  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.once('keypress', (key) => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      resolve(String(key));
    });
  });
}

function reportKappa(state, judgments) {
  const byPair = new Map(judgments.map((j) => [`${j.intentId}::${j.articleId}`, j.grade]));
  const pairs = state.items
    .filter((item) => item.grade !== undefined)
    .map((item) => [item.grade, byPair.get(`${item.intentId}::${item.articleId}`)])
    .filter(([, judge]) => judge !== undefined);

  if (pairs.length < 10) {
    console.log(`\n${pairs.length} labelled so far. Kappa is computed once at least 10 are done.`);
    return;
  }

  const kappa = cohensKappa(pairs);
  const exact = pairs.filter(([a, b]) => a === b).length;
  const close = pairs.filter(([a, b]) => Math.abs(a - b) <= 1).length;

  console.log(`\nLabelled ${pairs.length} pairs.`);
  console.log(`  exact agreement   ${((exact / pairs.length) * 100).toFixed(0)}%`);
  console.log(`  within one grade  ${((close / pairs.length) * 100).toFixed(0)}%`);
  console.log(`  Cohen's kappa     ${kappa.toFixed(3)}`);
  console.log(
    kappa >= constants.calibrationMinimumKappa
      ? `  at or above the ${constants.calibrationMinimumKappa} floor, the judge is kept`
      : `  below the ${constants.calibrationMinimumKappa} floor, the judge is rejected and the pool is labelled by hand`,
  );
  state.kappa = kappa;
  save(state);
}

async function main() {
  const judgments = loadJudgments();
  if (judgments.length === 0) {
    throw new Error('no judgments yet. Run: node scripts/judge-pool.js');
  }

  const corpus = new Map(loadCorpus().map((article) => [article.id, article]));
  const intents = new Map(loadIntents().map((intent) => [intent.id, intent]));

  const state = load();
  if (state.items.length === 0) {
    state.items = stratifiedSample(judgments, constants.calibrationSampleSize);
    save(state);
  }

  const todo = state.items.filter((item) => item.grade === undefined);
  if (todo.length === 0) {
    reportKappa(state, judgments);
    return;
  }

  for (const item of todo) {
    const done = state.items.length - state.items.filter((entry) => entry.grade === undefined).length;
    render(intents.get(item.intentId), corpus.get(item.articleId), done + 1, state.items.length);

    const key = await askKey();
    if (key === 'q' || key === '') {
      break;
    }
    if (!'0123'.includes(key)) {
      continue;
    }

    item.grade = Number(key);
    save(state);
  }

  reportKappa(state, judgments);
}

main().catch((err) => {
  console.error('CALIBRATION FAILED:', err.message);
  process.exit(1);
});
