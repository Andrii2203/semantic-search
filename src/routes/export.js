'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const router = express.Router();

// ─── GET /api/export — download all items with comments as JSON

router.get('/', (_req, res, next) => {
  try {
    const exportPath = path.join(__dirname, '..', '..', 'data', 'export.json');

    if (fs.existsSync(exportPath)) {
      res.download(exportPath, 'semantic-search-export.json');
    } else {
      res.json({ items: [] });
    }
  } catch (err) {
    /* istanbul ignore next */
    next(err);
  }
});

/**
 * Append item+comment to the JSON export file.
 */
async function saveToExportFile(id, item, comment) {
  const { writeFile, readFile } = fs.promises;
  const exportPath = path.join(__dirname, '..', '..', 'data', 'export.json');

  let data = { items: [] };
  if (fs.existsSync(exportPath)) {
    try {
      data = JSON.parse(await readFile(exportPath, 'utf-8'));
    } catch (_) {
      /* istanbul ignore next */
      data = { items: [] };
    }
  }

  // Update if exists, add if new
  const idx = data.items.findIndex((i) => i.id === id);
  const entry = {
    id,
    title: item.metadata?.title || '',
    url: item.metadata?.url || '',
    source: item.source,
    type: item.type,
    content: item.content,
    comment,
    generatedAt: new Date().toISOString(),
  };

  if (idx >= 0) {
    data.items[idx] = entry;
  } else {
    data.items.push(entry);
  }

  await writeFile(exportPath, JSON.stringify(data, null, 2), 'utf-8');
  logger.info({ exportPath, totalExported: data.items.length }, 'Exported to JSON');
}

module.exports = { router, saveToExportFile };
