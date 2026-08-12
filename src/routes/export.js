'use strict';

const express = require('express');
const fs = require('fs');
const logger = require('../logger');
const config = require('../config');

const router = express.Router();

router.get('/', (_req, res, next) => {
  try {
    if (fs.existsSync(config.exportPath)) {
      res.download(config.exportPath, 'semantic-search-export.json');
    } else {
      res.json({ items: [] });
    }
  } catch (err) {
    /* istanbul ignore next */
    next(err);
  }
});

async function saveToExportFile(id, item, comment) {
  const { writeFile, readFile } = fs.promises;
  const exportPath = config.exportPath;

  let data = { items: [] };
  if (fs.existsSync(exportPath)) {
    try {
      data = JSON.parse(await readFile(exportPath, 'utf-8'));
    } catch (_) {
      /* istanbul ignore next */
      data = { items: [] };
    }
  }

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
