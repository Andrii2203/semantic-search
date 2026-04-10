// migrate.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('./data/app.db');

const items = db.prepare('SELECT id, source, metadata FROM items').all();
const updateStmt = db.prepare('UPDATE items SET metadata = ? WHERE id = ?');

let updated = 0;
for (const item of items) {
  const metadata = JSON.parse(item.metadata);
  
  if (!metadata.threadUrl) {
    if (item.source === 'hn' && metadata.hnId) {
      metadata.threadUrl = `https://news.ycombinator.com/item?id=${metadata.hnId}`;
    } else if (item.source === 'reddit' && metadata.permalink) {
      metadata.threadUrl = metadata.permalink;
    }
    
    if (metadata.threadUrl) {
      updateStmt.run(JSON.stringify(metadata), item.id);
      updated++;
    }
  }
}

console.log(`Successfully updated ${updated} items with threadUrl.`);
db.close();
