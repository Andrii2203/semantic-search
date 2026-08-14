'use strict';

// Judges every pair in eval/pool.json that does not already carry a judgment, and appends to
// eval/judgments.json after each answer so the pass is resumable.
//
//   node scripts/judge-pool.js [limit]
//
// The queue is the file: pairs without a judgment are the work left. Kill this and run it again and
// it continues. Planted controls run first, and a failed control stops the pass before any real
// judgment is written. See docs/plans/evaluation-corpus.md sections 9.1 and 9.2.

const fs = require('fs');
const path = require('path');
const { loadCorpus, loadIntents, EVAL_DIR } = require('../src/eval/corpus-loader');
const { loadJudgments, saveJudgments } = require('../src/eval/judgments');
const { judgePair, getSpend, PROMPT_VERSION } = require('../src/eval/judge');
const constants = require('../src/search-constants');

const LIMIT = parseInt(process.argv[2] || '0', 10);
const SPEND_CAP_USD = parseFloat(process.env.JUDGE_SPEND_CAP || '1.50');
const PAUSE_MS = Math.ceil(60_000 / constants.judgeCallsPerMinute);

function pause() {
  return new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}

function readPool() {
  const file = path.join(EVAL_DIR, 'pool.json');
  if (!fs.existsSync(file)) {
    throw new Error('no pool. Run: node scripts/build-pool.js');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')).items;
}

async function runControls(corpus) {
  const technology = corpus.filter((article) => article.source === 'guardian_technology');
  const science = corpus.filter((article) => article.source === 'guardian_science');

  const controls = [
    { name: 'identity', intent: technology[0], article: technology[0], accept: (grade) => grade === 3 },
    { name: 'unrelated', intent: technology[1], article: science[40], accept: (grade) => grade === 0 },
    { name: 'unrelated', intent: science[2], article: technology[60], accept: (grade) => grade === 0 },
  ];

  for (const control of controls) {
    const judgment = await judgePair(control.intent, control.article);
    const passed = control.accept(judgment.grade);
    console.log(`  control ${control.name}: grade ${judgment.grade} ${passed ? 'ok' : 'FAILED'}`);
    if (!passed) {
      throw new Error(`planted control ${control.name} failed, no answer key written`);
    }
    await pause();
  }
}

function pending(pool, judgments) {
  const done = new Set(
    judgments
      .filter((j) => j.model === constants.judgeModel && j.promptVersion === PROMPT_VERSION)
      .map((j) => `${j.intentId}::${j.articleId}`),
  );
  return pool.filter((pair) => !done.has(`${pair.intentId}::${pair.articleId}`));
}

async function main() {
  const corpus = new Map(loadCorpus().map((article) => [article.id, article]));
  const intents = new Map(loadIntents().map((intent) => [intent.id, intent]));
  const pool = readPool();
  const judgments = loadJudgments();

  let todo = pending(pool, judgments);
  if (LIMIT > 0) {
    todo = todo.slice(0, LIMIT);
  }

  console.log(`Pool ${pool.length}, already judged ${pool.length - pending(pool, judgments).length}, to do ${todo.length}`);
  console.log(`Model ${constants.judgeModel}, ${constants.judgeCallsPerMinute} calls per minute\n`);

  if (todo.length === 0) {
    console.log('Nothing to judge.');
    return;
  }

  console.log('Planted controls:');
  await runControls([...corpus.values()]);

  const failures = [];
  let done = 0;

  let stoppedOnSpend = false;

  for (const pair of todo) {
    if (getSpend() >= SPEND_CAP_USD) {
      stoppedOnSpend = true;
      break;
    }

    const intent = intents.get(pair.intentId);
    const article = corpus.get(pair.articleId);

    try {
      judgments.push(await judgePair(intent, article));
      done++;
      if (done % 10 === 0) {
        saveJudgments(judgments);
        process.stdout.write(
          `  judged ${done}/${todo.length}  spent $${getSpend().toFixed(4)}\r`,
        );
      }
    } catch (err) {
      failures.push({ pair, error: err.name, message: err.message });
    }

    await pause();
  }

  saveJudgments(judgments);

  console.log(`\nJudged ${done} of ${todo.length}, failures ${failures.length}`);
  console.log(`Spent $${getSpend().toFixed(4)} of the $${SPEND_CAP_USD.toFixed(2)} cap`);
  if (stoppedOnSpend) {
    console.log('Stopped on the spend cap, not on completion. Raise JUDGE_SPEND_CAP to continue.');
    process.exitCode = 1;
  }
  for (const failure of failures.slice(0, 10)) {
    console.log(`  ${failure.error}: ${failure.message.slice(0, 90)}`);
  }
  if (failures.length > 0) {
    console.log('\nRe-run to retry the failed pairs. The answer key is incomplete until they resolve.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('JUDGING FAILED:', err.message);
  process.exit(1);
});
