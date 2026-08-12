'use strict';

// Inspect / clear the Files-Mode library.
//   node scripts/clear-files.js            → report counts + duplicate fileNames
//   node scripts/clear-files.js --clear    → delete ALL files-collection items + their chunks
//
// Use inside the container: docker compose exec -T app node scripts/clear-files.js [--clear]

const Database = require('better-sqlite3');
const config = require('../src/config');

const db = new Database(config.dbPath);
const total = db.prepare("SELECT count(*) c FROM items WHERE collection_id='files'").get().c;
const dups = db
  .prepare(
    "SELECT json_extract(metadata,'$.fileName') fn, count(*) c " +
    "FROM items WHERE collection_id='files' GROUP BY fn HAVING c>1 ORDER BY c DESC LIMIT 10",
  )
  .all();

console.log(`Total files items: ${total}`);
console.log(`Distinct fileNames with duplicates: ${dups.length}`);
if (dups.length) {console.log('  sample:', dups.map((d) => `${d.fn}×${d.c}`).join(', '));}

if (process.argv.includes('--clear')) {
  const chunks = db
    .prepare("DELETE FROM chunks WHERE parent_id IN (SELECT id FROM items WHERE collection_id='files')")
    .run();
  const items = db.prepare("DELETE FROM items WHERE collection_id='files'").run();
  console.log(`\nCLEARED: ${items.changes} file items, ${chunks.changes} chunks deleted.`);
}
db.close();
