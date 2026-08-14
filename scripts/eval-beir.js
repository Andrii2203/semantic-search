'use strict';

const { runConfiguration, CONFIGURATIONS } = require('../src/eval/harness');

const PUBLISHED_BM25 = { scifact: 0.665, nfcorpus: 0.325, fiqa: 0.236 };

async function main() {
  const [configuration, ...datasets] = process.argv.slice(2);

  if (!configuration || datasets.length === 0) {
    console.error(
      `usage: node scripts/eval-beir.js <configuration> <dataset...>\n` +
        `configurations: ${Object.keys(CONFIGURATIONS).join(', ')}`,
    );
    process.exit(1);
  }

  for (const dataset of datasets) {
    const started = Date.now();
    const result = await runConfiguration({
      configuration,
      dataset,
      onProgress: (done, total) => {
        if (done % 1600 === 0 || done === total) {
          console.log(`  embedding ${dataset}: ${done} of ${total}`);
        }
      },
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    const values = result.metrics
      .map((metric) => `${metric.name} ${metric.value.toFixed(4)}`)
      .join('  ');
    const published = configuration.startsWith('bm25') ? PUBLISHED_BM25[dataset] : undefined;
    const ndcg = result.metrics[0].value;
    const gap = published === undefined ? '' : `  published ${published.toFixed(3)}  gap ${(ndcg - published).toFixed(4)}`;

    console.log(`${dataset}  ${configuration}  queries ${result.queries}  ${values}${gap}  ${seconds}s`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
