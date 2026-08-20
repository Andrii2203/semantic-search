'use strict';

const db = require('../src/db');
const searchEngine = require('../src/search-engine');
const constants = require('../src/search-constants');
const { batchFor } = require('../src/models');
const logger = require('../src/logger');
const config = require('../src/config');

function chunksToReindex(model) {
  return db
    .getDb()
    .prepare('SELECT id, content FROM chunks WHERE vector IS NOT NULL AND model IS NOT ?')
    .all(model);
}

function profilesToReindex(model) {
  return db
    .getDb()
    .prepare('SELECT id, raw_input FROM profiles WHERE vector IS NOT NULL AND model IS NOT ?')
    .all(model);
}

function storeChunkVectors(rows, vectors, model) {
  const update = db
    .getDb()
    .prepare('UPDATE chunks SET vector = ?, model = ?, dimensions = ? WHERE id = ?');

  db.getDb().transaction(() => {
    rows.forEach((row, index) => {
      update.run(searchEngine.serializeVector(vectors[index]), model, vectors[index].length, row.id);
    });
  })();
}

function storeProfileVectors(rows, vectors, model) {
  const update = db
    .getDb()
    .prepare('UPDATE profiles SET vector = ?, model = ?, dimensions = ? WHERE id = ?');

  db.getDb().transaction(() => {
    rows.forEach((row, index) => {
      update.run(searchEngine.serializeVector(vectors[index]), model, vectors[index].length, row.id);
    });
  })();
}

async function embedInBatches(context) {
  const { rows, side, textOf, store, size, model, progress } = context;

  for (let start = 0; start < rows.length; start += size) {
    const batch = rows.slice(start, start + size);
    const vectors = await searchEngine.generateEmbeddings(
      batch.map(textOf),
      side,
      context.options,
    );

    store(batch, vectors, model);
    progress(batch.length);
  }
}

async function reindex(options = {}) {
  const model = constants.embeddingModel;
  const size = options.batchSize || batchFor(model);
  const chunks = chunksToReindex(model);
  const profiles = profilesToReindex(model);
  const withText = profiles.filter((row) => row.raw_input && row.raw_input.trim().length > 0);

  const total = chunks.length + withText.length;
  let done = 0;
  const progress = (count) => {
    done += count;
    if (options.onProgress) {
      options.onProgress(done, total);
    }
  };

  const shared = { size, model, progress, options: { encode: options.encode } };

  await embedInBatches({
    ...shared, rows: chunks, side: 'document', textOf: (row) => row.content, store: storeChunkVectors,
  });
  await embedInBatches({
    ...shared, rows: withText, side: 'query', textOf: (row) => row.raw_input, store: storeProfileVectors,
  });

  return {
    model,
    chunks: chunks.length,
    profiles: withText.length,
    profilesWithoutText: profiles.length - withText.length,
  };
}

/* istanbul ignore next */
async function main() {
  db.init(config.dbPath);
  const started = Date.now();
  const report = await reindex({
    onProgress: (done, total) => console.log(`reindexed ${done} of ${total}`),
  });

  logger.info(
    { ...report, seconds: Math.round((Date.now() - started) / 1000) },
    'Reindex complete',
  );
  console.log(JSON.stringify(report, null, 2));
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err) => {
    console.error('REINDEX FAILED:', err.message);
    process.exit(1);
  });
}

module.exports = { reindex };
