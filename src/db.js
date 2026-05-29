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
  {
    name: '003_create_chunks',
    up: `
      CREATE TABLE IF NOT EXISTS chunks (
        id          TEXT PRIMARY KEY,
        parent_id   TEXT NOT NULL,
        content     TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        level       TEXT DEFAULT 'section',
        strategy    TEXT NOT NULL,
        vector      BLOB,
        metadata    TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_parent ON chunks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_strategy ON chunks(strategy);
    `,
  },
  {
    name: '004_create_chunks_fts',
    up: `
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
      USING fts5(content, content='chunks', content_rowid='rowid', tokenize='porter unicode61');

      CREATE TRIGGER IF NOT EXISTS chunks_fts_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS chunks_fts_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS chunks_fts_au AFTER UPDATE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
      END;
    `,
  },
  {
    name: '005_create_profiles',
    up: `
      CREATE TABLE IF NOT EXISTS profiles (
        id          TEXT PRIMARY KEY,
        keywords    TEXT,
        vector      BLOB,
        raw_input   TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    name: '006_create_chunking_config',
    up: `
      CREATE TABLE IF NOT EXISTS chunking_config (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        strategy    TEXT NOT NULL DEFAULT 'semantic',
        chunk_size  INTEGER DEFAULT 200,
        overlap     INTEGER DEFAULT 50,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO chunking_config (id) VALUES (1);
    `,
  },
  {
    name: '007_add_collection_id_to_items',
    up: `
      ALTER TABLE items ADD COLUMN collection_id TEXT DEFAULT 'internet';
      UPDATE items SET collection_id = 'internet' WHERE collection_id IS NULL;
      CREATE INDEX IF NOT EXISTS idx_items_collection_id ON items(collection_id);
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
  db.pragma('synchronous = NORMAL');

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
    INSERT OR IGNORE INTO items (id, content, type, source, metadata, score, response, status, fingerprint, collection_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    item.collectionId || 'internet',
  );

  return result.changes > 0;
}

function insertItemsBatch(items) {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR IGNORE INTO items (id, content, type, source, metadata, score, response, status, fingerprint, collection_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        item.collectionId || 'internet',
      );
      if (result.changes > 0) {
        inserted++;
      }
    }
    return inserted;
  });

  return insertMany(items);
}

function buildItemConditions({ status, source, type, collectionId }) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (source) {
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
  if (collectionId) {
    conditions.push('collection_id = ?');
    params.push(collectionId);
  }

  return { conditions, params };
}

function deserializeItem(row) {
  return { ...row, metadata: row.metadata ? JSON.parse(row.metadata) : {} };
}

function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function encodeCursor(item) {
  return Buffer.from(JSON.stringify({ created_at: item.created_at, id: item.id })).toString('base64url');
}

function getItems({ status, source, type, collectionId, limit = 50, offset = 0 } = {}) {
  const d = getDb();
  const { conditions, params } = buildItemConditions({ status, source, type, collectionId });

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM items ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return d.prepare(sql).all(...params).map(deserializeItem);
}

// Cursor-based pagination — returns { items, nextCursor, hasMore }
function getItemsPage({ status, source, type, collectionId, limit = 50, cursor } = {}) {
  const d = getDb();
  const { conditions, params } = buildItemConditions({ status, source, type, collectionId });

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
      params.push(decoded.created_at, decoded.created_at, decoded.id);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  // Fetch one extra to detect hasMore
  params.push(limit + 1);

  const rows = d.prepare(`SELECT * FROM items ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...params);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(deserializeItem);
  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null;

  return { items, nextCursor, hasMore };
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

function deleteItem(id) {
  const d = getDb();
  const result = d.prepare('DELETE FROM items WHERE id = ?').run(id);
  return result.changes > 0;
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

function updateItemMetadata(id, metadataUpdate) {
  const d = getDb();
  const row = d.prepare('SELECT metadata FROM items WHERE id = ?').get(id);
  if (!row) return false;
  const existing = row.metadata ? JSON.parse(row.metadata) : {};
  const updated = { ...existing, ...metadataUpdate };
  d.prepare('UPDATE items SET metadata = ? WHERE id = ?').run(JSON.stringify(updated), id);
  return true;
}

function getItemCount({ status, source, collectionId } = {}) {
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
  if (collectionId) {
    conditions.push('collection_id = ?');
    params.push(collectionId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return d.prepare(`SELECT COUNT(*) as count FROM items ${where}`).get(...params).count;
}

function getSources() {
  const d = getDb();
  return d.prepare('SELECT DISTINCT source FROM items').all().map((row) => row.source);
}

function close() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

// ─── Chunks CRUD ─────────────────────────────────────────────

function insertChunk(chunk) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT OR REPLACE INTO chunks (id, parent_id, content, chunk_index, level, strategy, vector, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    chunk.id,
    chunk.parentId,
    chunk.content,
    chunk.chunkIndex,
    chunk.level || 'section',
    chunk.strategy,
    chunk.vector || null,
    JSON.stringify(chunk.metadata || {}),
  );
}

function insertChunksBatch(chunks) {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR REPLACE INTO chunks (id, parent_id, content, chunk_index, level, strategy, vector, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = d.transaction((rows) => {
    let count = 0;
    for (const chunk of rows) {
      insert.run(
        chunk.id,
        chunk.parentId,
        chunk.content,
        chunk.chunkIndex,
        chunk.level || 'section',
        chunk.strategy,
        chunk.vector || null,
        JSON.stringify(chunk.metadata || {}),
      );
      count++;
    }
    return count;
  });

  return insertMany(chunks);
}

function getChunksByParent(parentId) {
  const d = getDb();
  return d
    .prepare('SELECT * FROM chunks WHERE parent_id = ? ORDER BY chunk_index')
    .all(parentId)
    .map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    }));
}

function deleteChunksByParent(parentId) {
  const d = getDb();
  return d.prepare('DELETE FROM chunks WHERE parent_id = ?').run(parentId).changes;
}

function chunksSearch(keywords, options = {}) {
  const d = getDb();
  const limit = options.limit || 100;
  const collectionId = options.collectionId || null;
  const query = keywords
    .filter(Boolean)
    .map((k) => `"${k.replace(/"/g, '""')}"`)
    .join(' OR ');

  if (!query.trim()) return [];

  try {
    let rows;
    if (collectionId) {
      rows = d
        .prepare(
          `SELECT c.*, chunks_fts.rank
           FROM chunks_fts
           JOIN chunks c ON c.rowid = chunks_fts.rowid
           JOIN items i ON c.parent_id = i.id
           WHERE chunks_fts MATCH ?
           AND i.collection_id = ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(query, collectionId, limit);
    } else {
      rows = d
        .prepare(
          `SELECT c.*, chunks_fts.rank
           FROM chunks_fts
           JOIN chunks c ON c.rowid = chunks_fts.rowid
           WHERE chunks_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(query, limit);
    }
    return rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    }));
  } catch (err) {
    logger.warn({ err, query }, 'FTS5 search failed, returning empty');
    return [];
  }
}

// ─── Profiles CRUD ───────────────────────────────────────────

function saveProfile(profile) {
  const d = getDb();
  d.prepare(`
    INSERT OR REPLACE INTO profiles (id, keywords, vector, raw_input)
    VALUES (?, ?, ?, ?)
  `).run(
    profile.id,
    JSON.stringify(profile.keywords || []),
    profile.vector || null,
    profile.rawInput || '',
  );
  return profile.id;
}

function getProfile(id) {
  const d = getDb();
  const row = d.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    keywords: row.keywords ? JSON.parse(row.keywords) : [],
  };
}

function getAllProfiles() {
  const d = getDb();
  return d
    .prepare('SELECT * FROM profiles ORDER BY created_at DESC')
    .all()
    .map((row) => ({
      ...row,
      keywords: row.keywords ? JSON.parse(row.keywords) : [],
    }));
}

function deleteProfile(id) {
  const d = getDb();
  return d.prepare('DELETE FROM profiles WHERE id = ?').run(id).changes > 0;
}

// ─── Chunking Config ─────────────────────────────────────────

function getChunkingConfig() {
  const d = getDb();
  const row = d.prepare('SELECT * FROM chunking_config WHERE id = 1').get();
  return row || { strategy: 'semantic', chunk_size: 200, overlap: 50 };
}

function updateChunkingConfig({ strategy, chunkSize, overlap }) {
  const d = getDb();
  d.prepare(`
    UPDATE chunking_config
    SET strategy = COALESCE(?, strategy),
        chunk_size = COALESCE(?, chunk_size),
        overlap = COALESCE(?, overlap),
        updated_at = datetime('now')
    WHERE id = 1
  `).run(strategy || null, chunkSize || null, overlap || null);
}

function getAllChunksWithVectors(options = {}) {
  const d = getDb();
  const collectionId = options.collectionId || null;

  const rows = collectionId
    ? d
        .prepare(
          `SELECT c.* FROM chunks c
           JOIN items i ON c.parent_id = i.id
           WHERE c.vector IS NOT NULL AND i.collection_id = ?`,
        )
        .all(collectionId)
    : d.prepare('SELECT * FROM chunks WHERE vector IS NOT NULL').all();

  return rows.map((row) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  }));
}

function getActiveProfile() {
  const d = getDb();
  const row = d.prepare('SELECT * FROM profiles ORDER BY created_at DESC LIMIT 1').get();
  if (!row) {
    throw new AppError('No active profile found. Create a profile first.', ErrorCodes.DB_ERROR);
  }
  return {
    ...row,
    keywords: row.keywords ? JSON.parse(row.keywords) : [],
    vector: row.vector ? new Float32Array(row.vector) : null,
  };
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
  getItemsPage,
  getItemById,
  deleteItem,
  updateItemStatus,
  updateItemResponse,
  updateItemMetadata,
  getItemCount,
  getSources,
  // Chunks
  insertChunk,
  insertChunksBatch,
  getChunksByParent,
  deleteChunksByParent,
  chunksSearch,
  getAllChunksWithVectors,
  // Profiles
  saveProfile,
  getProfile,
  getAllProfiles,
  deleteProfile,
  getActiveProfile,
  // Config
  getChunkingConfig,
  updateChunkingConfig,
};

