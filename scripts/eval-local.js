'use strict';

const { runConfiguration, CONFIGURATIONS } = require('../src/eval/harness');
const { loadLocalDataset } = require('../src/eval/local-bench');
const { compare } = require('../src/eval/significance');

async function score(configuration, dataset) {
  const started = Date.now();
  const result = await runConfiguration({
    configuration,
    dataset,
    onProgress: (done, total) => {
      if (done % 640 === 0 || done === total) {
        console.log(`  embedding local corpus: ${done} of ${total}`);
      }
    },
  });

  const values = result.metrics.map((metric) => `${metric.name} ${metric.value.toFixed(4)}`).join('  ');
  console.log(`local-news  ${configuration}  queries ${result.queries}  ${values}  ${((Date.now() - started) / 1000).toFixed(1)}s`);

  return result;
}

async function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error(
      `usage: node scripts/eval-local.js <configuration...>\n` +
        `configurations: ${Object.keys(CONFIGURATIONS).join(', ')}`,
    );
    process.exit(1);
  }

  const dataset = loadLocalDataset();
  console.log(
    `local-news dev split: ${dataset.documents.length} articles, ${dataset.judgedIntents} judged intents, ` +
      `${dataset.answerable} answerable, ${dataset.unanswerable} with no relevant article and left out`,
  );

  const results = [];
  for (const name of names) {
    results.push(await score(name, dataset));
  }

  if (results.length === 2) {
    for (const row of compare(results[0], results[1], {})) {
      console.log(
        `  ${row.metric}  difference ${row.difference.toFixed(4)}  ` +
          `interval [${row.lower.toFixed(4)}, ${row.upper.toFixed(4)}] ` +
          `${row.lower <= 0 && row.upper >= 0 ? 'contains zero' : 'excludes zero'}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
