'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { AppError, ErrorCodes } = require('./errors');
const { validateItemQuery } = require('./validation');
const { createShutdownHandler } = require('./shutdown');
const scheduler = require('./scheduler');
const sources = require('./sources/index');

const app = express();

// ─── Middleware ───────────────────────────────────────────────

app.use(helmet());

app.use(
  cors({
    origin: config.corsOrigin,
  }),
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: config.apiRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } },
  }),
);

app.use(express.json());

// Serve static files from /public
app.use(express.static('public'));

// ─── Health Check ────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  let dbStatus = 'disconnected';
  try {
    db.getDb();
    dbStatus = 'connected';
  } catch (_e) {
    // DB not initialized
  }

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// ─── Sources API ─────────────────────────────────────────────

// GET /api/sources — list registered source names
app.get('/api/sources', (_req, res) => {
  res.json({ sources: sources.getRegisteredSources() });
});

// ─── Items API ───────────────────────────────────────────────

// GET /api/items — list items with optional filters
app.get('/api/items', (req, res, next) => {
  try {
    const parsed = validateItemQuery(req.query);
    if (!parsed.success) {
      throw new AppError(
        `Invalid query: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        ErrorCodes.VALIDATION_FAILED,
        400,
      );
    }

    const items = db.getItems(parsed.data);
    const total = db.getItemCount(parsed.data.status, parsed.data.source);

    res.json({
      items,
      total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/items/stats — counts by status
app.get('/api/items/stats', (_req, res, next) => {
  try {
    res.json({
      total: db.getItemCount(),
      new: db.getItemCount('new'),
      approved: db.getItemCount('approved'),
      skipped: db.getItemCount('skipped'),
      pending: db.getItemCount('pending'),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/items/:id/approve — approve an item
app.post('/api/items/:id/approve', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    db.updateItemStatus(id, 'approved');
    res.json({ success: true, id, status: 'approved' });
  } catch (err) {
    next(err);
  }
});

// POST /api/items/:id/skip — skip an item
app.post('/api/items/:id/skip', (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    db.updateItemStatus(id, 'skipped');
    res.json({ success: true, id, status: 'skipped' });
  } catch (err) {
    next(err);
  }
});

// POST /api/sync — trigger manual fetch cycle
app.post('/api/sync', async (_req, res, next) => {
  try {
    scheduler.runCycle().catch((err) => logger.error({ err }, 'Manual sync failed'));
    res.json({ success: true, message: 'Sync started' });
  } catch (err) {
    next(err);
  }
});

// POST /api/items/:id/generate — on-demand AI comment generation
app.post('/api/items/:id/generate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = db.getItemById(id);

    if (!item) {
      throw new AppError(`Item not found: ${id}`, ErrorCodes.NOT_FOUND, 404);
    }

    // Call Groq to generate comment
    const { retry } = require('./retry');

    const response = await retry(
      async () => {
        const apiRes = await globalThis.fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.groq.apiKey}`,
          },
          body: JSON.stringify({
            model: config.groq.model,
            max_tokens: config.groq.maxTokens,
            messages: [
              {
                role: 'system',
                content: 'use the same writting style as in the example and comment this. do not and empty links or not truthful information',
              },
              {
                role: 'user',
                content: `Write a comment for this post:\n\nTitle: ${item.metadata?.title || ''}\nContent: ${item.content}\nURL: ${item.metadata?.url || ''}\n\nYour comment:`,
              },
            ],
          }),
        });

        if (!apiRes.ok) {
          const body = await apiRes.text();
          throw new Error(`Groq API ${apiRes.status}: ${body}`);
        }
        return apiRes.json();
      },
      { maxRetries: 2, baseDelay: 1000, label: 'groq-on-demand' },
    );

    const comment = response.choices?.[0]?.message?.content?.trim();

    if (!comment) {
      throw new AppError('AI returned empty response', 'GENERATION_FAILED', 500);
    }

    // Save to DB
    db.updateItemResponse(id, comment, null);

    // Save to JSON export file
    saveToExportFile(id, item, comment);

    logger.info({ itemId: id, responseLength: comment.length }, 'Comment generated on demand');
    res.json({ success: true, id, comment });
  } catch (err) {
    next(err);
  }
});

// GET /api/export — download all items with comments as JSON
app.get('/api/export', (_req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const exportPath = path.join(__dirname, '..', 'data', 'export.json');

    if (fs.existsSync(exportPath)) {
      res.download(exportPath, 'semantic-search-export.json');
    } else {
      res.json({ items: [] });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Append item+comment to the JSON export file.
 */
function saveToExportFile(id, item, comment) {
  const fs = require('fs');
  const path = require('path');
  const exportPath = path.join(__dirname, '..', 'data', 'export.json');

  let data = { items: [] };
  if (fs.existsSync(exportPath)) {
    try {
      data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    } catch (_) {
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

  fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf-8');
  logger.info({ exportPath, totalExported: data.items.length }, 'Exported to JSON');
}

// ─── 404 for unknown routes ──────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ─── Global error handler ────────────────────────────────────

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (statusCode >= 500) {
    logger.error({ err, code }, err.message);
  }

  res.status(statusCode).json({
    error: {
      code,
      message: config.isProduction ? 'Internal server error' : err.message,
    },
  });
});

// ─── Start ───────────────────────────────────────────────────

function start() {
  // Initialize database
  db.init();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
  });

  createShutdownHandler(server, db);

  // Start scheduler (cron) + run first cycle immediately
  // scheduler.start();
  // scheduler.runCycle().catch((err) => logger.error({ err }, 'Initial cycle failed'));
  logger.info('Server ready. Use "Fetch Posts" button to sync manually.');
  
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
