'use strict';

const constants = require('../src/search-constants');
const { runConfiguration, CONFIGURATIONS } = require('../src/eval/harness');
const { compare } = require('../src/eval/significance');

function main() {
  const [first, second, ...datasets] = process.argv.slice(2);

  if (!first || !second || datasets.length === 0) {
    console.error(
      `usage: node scripts/compare-beir.js <configuration> <configuration> <dataset...>\n` +
        `configurations: ${Object.keys(CONFIGURATIONS).join(', ')}`,
    );
    process.exit(1);
  }

  console.log(
    `paired bootstrap, ${constants.bootstrapResamples} resamples, ` +
      `${(100 * (1 - constants.bootstrapAlpha)).toFixed(0)} percent interval, seed ${constants.bootstrapSeed}`,
  );

  for (const dataset of datasets) {
    const rows = compare(
      runConfiguration({ configuration: first, dataset }),
      runConfiguration({ configuration: second, dataset }),
      {},
    );

    for (const row of rows) {
      const interval = `[${row.lower.toFixed(4)}, ${row.upper.toFixed(4)}]`;
      const crosses = row.lower <= 0 && row.upper >= 0 ? 'contains zero' : 'excludes zero';

      console.log(
        `${dataset}  ${row.metric}  ${row.first} ${row.firstValue.toFixed(4)} ` +
          `against ${row.second} ${row.secondValue.toFixed(4)}  ` +
          `difference ${row.difference.toFixed(4)}  interval ${interval} ${crosses}  ` +
          `wins ${(100 * row.winRate).toFixed(1)} percent of ${row.queries} queries resampled`,
      );
    }
  }
}

main();
