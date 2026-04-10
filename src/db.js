'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const logger = require('./logger');
const config = require('./config');
const { AppError, ErrorCodes } = require('./errors');

let db = null;

// ─── Migrations ───────────────────────────────────────────────

const migrations = [
  {
    name: '001_create_items',
    up: `
      CREATE TABLE IF NOT EXISTS items (
        id            TEXT PRIMARY KEY,
        content       TEXT NOT NULL,
        type          TEXT NOT NULL,
        source        TEXT NOT NULL,
        metadata      TEXT,
        score         REAL,
        response      TEXT,
        status        TEXT NOT NULL DEFAULT 'new',
        fingerprint   TEXT UNIQUE NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
      CREATE INDEX IF NOT EXISTS idx_items_source ON items(source);
      CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
      CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
    `,
  },
  {
    name: '002_create_migrations',
    up: `
      CREATE TABLE IF NOT EXISTS migrations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT UNIQUE NOT NULL,
        applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];

// ─── Initialization ──────────────────────────────────────────

function init(dbPath) {
  const resolvedPath = dbPath || config.dbPath;

  // Ensure data directory exists (skip for in-memory)
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations();

  logger.info({ dbPath: resolvedPath }, 'Database initialized');
  return db;
}

function runMigrations() {
  // Bootstrap: ensure migrations table exists first
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT UNIQUE NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  /* istanbul ignore next */
  const applied = new Set(
    db
      .prepare('SELECT name FROM migrations')
      .all()
      .map((r) => r.name),
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      db.exec(migration.up);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
      logger.info({ migration: migration.name }, 'Migration applied');
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function fingerprint(item) {
  const raw = `${item.source}:${item.type}:${item.content}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function getDb() {
  if (!db) {
    throw new AppError('Database not initialized. Call db.init() first.', ErrorCodes.DB_ERROR);
  }
  return db;
}

// ─── CRUD Operations ─────────────────────────────────────────

function insertItem(item) {
  const d = getDb();
  const fp = fingerprint(item);

  const stmt = d.prepare(`
    INSERT OR IGNORE INTO items (id, content, type, source, metadata, score, response, status, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    item.id,
    item.content,
    item.type,
    item.source,
    JSON.stringify(item.metadata || {}),
    item.score || null,
    item.response || null,
    item.status || 'new',
    fp,
  );

  return result.changes > 0;
}

function insertItemsBatch(items) {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR IGNORE INTO items (id, content, type, source, metadata, score, response, status, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = d.transaction((rows) => {
    let inserted = 0;
    for (const item of rows) {
      const fp = fingerprint(item);
      const result = insert.run(
        item.id,
        item.content,
        item.type,
        item.source,
        JSON.stringify(item.metadata || {}),
        item.score || null,
        item.response || null,
        item.status || 'new',
        fp,
      );
      if (result.changes > 0) {
        inserted++;
      }
    }
    return inserted;
  });

  return insertMany(items);
}

function getItems({ status, source, type, limit = 50, offset = 0 } = {}) {
  const d = getDb();
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (source) {
    // Support comma-separated sources: "hn,reddit" -> IN ('hn','reddit')
    const sources = source.split(',').map((s) => s.trim()).filter(Boolean);
    /* istanbul ignore next */
    if (sources.length === 1) {
      conditions.push('source = ?');
      params.push(sources[0]);
    } else if (sources.length > 1) {
      const placeholders = sources.map(() => '?').join(',');
      conditions.push(`source IN (${placeholders})`);
      params.push(...sources);
    }
  }
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM items ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = d.prepare(sql).all(...params);

  return rows.map((row) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  }));
}

function getItemById(id) {
  const d = getDb();
  const row = d.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!row) {
    return null;
  }
  return {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  };
}

function updateItemStatus(id, status) {
  const d = getDb();
  const result = d.prepare('UPDATE items SET status = ? WHERE id = ?').run(status, id);
  return result.changes > 0;
}

function updateItemResponse(id, response, score) {
  const d = getDb();
  const result = d
    .prepare('UPDATE items SET response = ?, score = ? WHERE id = ?')
    .run(response, score, id);
  return result.changes > 0;
}

function getItemCount(status, source) {
  const d = getDb();
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  /* istanbul ignore next */
  if (source) {
    const sources = source.split(',').map((s) => s.trim()).filter(Boolean);
    if (sources.length === 1) {
      conditions.push('source = ?');
      params.push(sources[0]);
    } else if (sources.length > 1) {
      const placeholders = sources.map(() => '?').join(',');
      conditions.push(`source IN (${placeholders})`);
      params.push(...sources);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return d.prepare(`SELECT COUNT(*) as count FROM items ${where}`).get(...params).count;
}

function close() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

// ─── Exports ─────────────────────────────────────────────────

module.exports = {
  init,
  close,
  getDb,
  fingerprint,
  insertItem,
  insertItemsBatch,
  getItems,
  getItemById,
  updateItemStatus,
  updateItemResponse,
  getItemCount,
};
