'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const searchEngine = require('../src/search-engine');
const { INTENTS, ITEMS, isRelevant, DIRTY_GROUPS } = require('../src/seed-dataset');
const { isKeywordStuffed } = require('../src/junk-filter');

const REPORT = path.resolve(__dirname, '..', 'docs', 'eval', 'inbox-admission.md');
const THRESHOLDS = (process.env.THRESHOLDS || '0.30,0.35,0.40,0.45,0.50,0.55,0.60,0.65')
  .split(',')
  .map(Number);
const SPLIT = process.env.SPLIT || 'dev';

function commitHash() {
  if (process.env.COMMIT) {
    return process.env.COMMIT;
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function scoreEverything(items) {
  const intentVectors = new Map();
  for (const intent of INTENTS) {
    intentVectors.set(intent.id, await searchEngine.generateEmbedding(intent.text));
  }

  const scored = [];
  const kept = items.filter((item) => !isKeywordStuffed(`${item.title} ${item.content}`));
  const droppedByFilter = items.length - kept.length;
  for (const item of kept) {
    const vector = await searchEngine.generateEmbedding(`${item.title}\n\n${item.content}`);
    for (const intent of INTENTS) {
      scored.push({
        item,
        intentId: intent.id,
        score: searchEngine.cosineSimilarity(vector, intentVectors.get(intent.id)),
        relevant: isRelevant(item, intent.id),
      });
    }
  }
  scored.droppedByFilter = droppedByFilter;
  return scored;
}

function countOutcome(stats, row, admitted) {
  if (admitted && row.relevant) {
    stats.tp++;
    return;
  }
  if (admitted) {
    stats.fp++;
    if (DIRTY_GROUPS.has(row.item.group)) {
      stats.dirtAdmitted.push(row);
    }
    return;
  }
  if (row.relevant) {
    stats.fn++;
    stats.missed.push(row);
    return;
  }
  stats.tn++;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function confusionAt(scored, threshold) {
  const stats = { tp: 0, fp: 0, fn: 0, tn: 0, dirtAdmitted: [], missed: [] };

  for (const row of scored) {
    countOutcome(stats, row, row.score >= threshold);
  }

  stats.precision = ratio(stats.tp, stats.tp + stats.fp);
  stats.recall = ratio(stats.tp, stats.tp + stats.fn);
  stats.f1 = ratio(2 * stats.precision * stats.recall, stats.precision + stats.recall);
  return stats;
}

function groupScores(scored) {
  const byGroup = new Map();
  for (const row of scored) {
    if (row.item.intent !== row.intentId) {
      continue;
    }
    if (!byGroup.has(row.item.group)) {
      byGroup.set(row.item.group, []);
    }
    byGroup.get(row.item.group).push(row.score);
  }

  return [...byGroup.entries()]
    .map(([group, scores]) => ({
      group,
      count: scores.length,
      min: Math.min(...scores),
      mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      max: Math.max(...scores),
    }))
    .sort((a, b) => b.mean - a.mean);
}

function percent(value) {
  return `${(value * 100).toFixed(0)}%`;
}

function report(split, scored) {
  const lines = [];
  lines.push(`## Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')}, split \`${split}\``);
  lines.push('');
  lines.push(
    `Commit \`${commitHash()}\`, model MiniLM through \`src/search-engine.js\`, ` +
      `${scored.length} intent and item pairs from ${new Set(scored.map((row) => row.item.title)).size} items ` +
      `and ${INTENTS.length} intents. Pre filter dropped ${scored.droppedByFilter} items before embedding.`,
  );
  lines.push('');
  lines.push('### Admission at each threshold');
  lines.push('');
  lines.push('| Threshold | Precision | Recall | F1 | Admitted | Dirt admitted | Missed |');
  lines.push('|---|---|---|---|---|---|---|');

  for (const threshold of THRESHOLDS) {
    const stats = confusionAt(scored, threshold);
    lines.push(
      `| ${threshold.toFixed(2)} | ${percent(stats.precision)} | ${percent(stats.recall)} | ` +
        `${percent(stats.f1)} | ${stats.tp + stats.fp} | ${stats.dirtAdmitted.length} | ${stats.fn} |`,
    );
  }

  lines.push('');
  lines.push('### Similarity by category, item against its own intent');
  lines.push('');
  lines.push('| Category | Items | Min | Mean | Max |');
  lines.push('|---|---|---|---|---|');
  for (const row of groupScores(scored)) {
    lines.push(
      `| ${row.group} | ${row.count} | ${row.min.toFixed(3)} | ${row.mean.toFixed(3)} | ${row.max.toFixed(3)} |`,
    );
  }

  const production = confusionAt(scored, Number(process.env.PRODUCTION_THRESHOLD || '0.35'));
  lines.push('');
  lines.push('### Named failures at the production threshold');
  lines.push('');
  if (production.dirtAdmitted.length === 0) {
    lines.push('Nothing dirty was admitted.');
  } else {
    for (const row of production.dirtAdmitted) {
      lines.push(
        `- admitted dirt: "${row.item.title}" (${row.item.group}) for intent \`${row.intentId}\` at ${row.score.toFixed(3)}`,
      );
    }
  }
  lines.push('');
  if (production.missed.length === 0) {
    lines.push('Nothing relevant was missed.');
  } else {
    for (const row of production.missed) {
      lines.push(
        `- missed: "${row.item.title}" (${row.item.group}) for intent \`${row.intentId}\` at ${row.score.toFixed(3)}`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const items = SPLIT === 'both' ? ITEMS : ITEMS.filter((item) => item.split === SPLIT);
  if (items.length === 0) {
    throw new Error(`No items in split ${SPLIT}`);
  }

  process.stdout.write(`Embedding ${items.length} items and ${INTENTS.length} intents\n`);
  const scored = await scoreEverything(items);
  const text = report(SPLIT, scored);

  process.stdout.write(`\n${text}\n`);

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  const header = fs.existsSync(REPORT)
    ? fs.readFileSync(REPORT, 'utf-8')
    : '# Inbox admission, measured\n\nAppend only. See `../standards/EVALUATION_STANDARD.md`.\n';
  fs.writeFileSync(REPORT, `${header}\n${text}`);
  process.stdout.write(`\nWritten to ${REPORT}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
