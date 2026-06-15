'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const logger = require('./logger');
const config = require('./config');
const { AppError, ErrorCodes } = require('./errors');
const WELCOME_MESSAGES = require('./welcome');

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
  {
    name: '008_create_users',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `,
  },
  {
    name: '009_add_user_id_to_items',
    up: `
      ALTER TABLE items ADD COLUMN user_id TEXT REFERENCES users(id);
      CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
    `,
  },
  {
    name: '010_add_user_id_to_profiles',
    up: `
      ALTER TABLE profiles ADD COLUMN user_id TEXT REFERENCES users(id);
      CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
    `,
  },
  {
    name: '011_create_user_matches',
    up: `
      CREATE TABLE IF NOT EXISTS user_matches (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        score      REAL,
        status     TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, item_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_matches_user_status ON user_matches(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_user_matches_item ON user_matches(item_id);
    `,
  },
  {
    // v7.1: internet content is a shared corpus — collapse per-user duplicates,
    // move personal status/score into user_matches, re-fingerprint by content hash
    name: '012_dedup_internet_corpus',
    up: (d) => backfillInternetCorpus(d),
  },
  {
    // Phase 3: normalized key-value settings — typed, partial updates, simple migrations
    name: '013_create_settings',
    up: `
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        type       TEXT NOT NULL DEFAULT 'string',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];

function contentHash(content) {
  return crypto.createHash('sha256').update(`${content}`).digest('hex').slice(0, 16);
}

function backfillInternetCorpus(d) {
  const items = d
    .prepare(
      "SELECT id, user_id, score, status, content, created_at FROM items WHERE collection_id = 'internet' ORDER BY created_at ASC, id ASC",
    )
    .all();
  if (items.length === 0) return;

  const upsertMatch = d.prepare(`
    INSERT INTO user_matches (user_id, item_id, score, status, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET
      score  = COALESCE(excluded.score, user_matches.score),
      status = excluded.status
  `);
  const makeCanonical = d.prepare('UPDATE items SET fingerprint = ?, user_id = NULL WHERE id = ?');
  const removeDupeChunks = d.prepare('DELETE FROM chunks WHERE parent_id = ?');
  const removeDupe = d.prepare('DELETE FROM items WHERE id = ?');

  const canonicalByHash = new Map();
  d.transaction(() => {
    for (const item of items) {
      const hash = contentHash(item.content);
      let canonicalId = canonicalByHash.get(hash);
      if (!canonicalId) {
        canonicalId = item.id;
        canonicalByHash.set(hash, canonicalId);
        makeCanonical.run(hash, item.id);
      }
      if (item.user_id) {
        upsertMatch.run(item.user_id, canonicalId, item.score, item.status || 'new', item.created_at);
      }
      if (canonicalId !== item.id) {
        removeDupeChunks.run(item.id);
        removeDupe.run(item.id);
      }
    }
  })();
  logger.info(
    { total: items.length, unique: canonicalByHash.size },
    'Internet corpus deduplicated, personal statuses moved to user_matches',
  );
}

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
      if (typeof migration.up === 'function') {
        migration.up(db);
      } else {
        db.exec(migration.up);
      }
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
      logger.info({ migration: migration.name }, 'Migration applied');
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────

// v7.1: internet content is a shared corpus — fingerprint by content only, so the
// same post from any source/user is stored and embedded once. Private collections
// (files, __temp_*) include the owner in the hash for full isolation.
function fingerprint(item, userId) {
  if ((item.collectionId || 'internet') === 'internet') {
    return contentHash(item.content);
  }
  const raw = `${userId || ''}:${item.source}:${item.type}:${item.content}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function getDb() {
  if (!db) {
    throw new AppError('Database not initialized. Call db.init() first.', ErrorCodes.DB_ERROR);
  }
  return db;
}

// ─── CRUD Operations ─────────────────────────────────────────

// Shared internet corpus rows have no owner; personal relevance lives in user_matches
function itemOwnerId(item) {
  return (item.collectionId || 'internet') === 'internet' ? null : item.userId || null;
}

function insertItem(item) {
  const d = getDb();
  const ownerId = itemOwnerId(item);
  const fp = fingerprint(item, ownerId);

  const stmt = d.prepare(`
    INSERT OR IGNORE INTO items (id, content, type, source, metadata, score, response, status, fingerprint, collection_id, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ownerId,
  );

  return result.changes > 0;
}

function insertItemsBatch(items) {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR IGNORE INTO items (id, content, type, source, metadata, score, response, status, fingerprint, collection_id, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = d.transaction((rows) => {
    let inserted = 0;
    for (const item of rows) {
      const ownerId = itemOwnerId(item);
      const fp = fingerprint(item, ownerId);
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
        ownerId,
      );
      if (result.changes > 0) {
        inserted++;
      }
    }
    return inserted;
  });

  return insertMany(items);
}

function buildItemConditions({ status, source, type, collectionId, userId }) {
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
  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }

  return { conditions, params };
}

function deserializeItem(row) {
  return { ...row, metadata: row.metadata ? JSON.parse(row.metadata) : {} };
}

// ─── Personal view over shared corpus (v7.1) ─────────────────
// Internet items are shared rows; the user's own status/score live in user_matches.
// Private items (files, __temp_*) belong to the user directly.
const USER_ITEMS_VIEW = `
  SELECT i.*, um.status AS user_status, um.score AS user_score
    FROM items i JOIN user_matches um ON um.item_id = i.id
   WHERE um.user_id = ? AND i.collection_id = 'internet'
  UNION ALL
  SELECT i.*, i.status AS user_status, i.score AS user_score
    FROM items i
   WHERE i.user_id = ? AND i.collection_id <> 'internet'
`;

function buildUserViewConditions({ status, source, type, collectionId }) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('user_status = ?');
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

function deserializeUserViewItem(row) {
  const { user_status: userStatus, user_score: userScore, ...rest } = row;
  return deserializeItem({ ...rest, status: userStatus, score: userScore ?? rest.score });
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

function getItems({ status, source, type, collectionId, userId, limit = 50, offset = 0 } = {}) {
  const d = getDb();

  if (userId) {
    const { conditions, params } = buildUserViewConditions({ status, source, type, collectionId });
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM (${USER_ITEMS_VIEW}) ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    return d
      .prepare(sql)
      .all(userId, userId, ...params, limit, offset)
      .map(deserializeUserViewItem);
  }

  const { conditions, params } = buildItemConditions({ status, source, type, collectionId });
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM items ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return d.prepare(sql).all(...params).map(deserializeItem);
}

// Cursor-based pagination — returns { items, nextCursor, hasMore }
function getItemsPage({ status, source, type, collectionId, userId, limit = 50, cursor } = {}) {
  const d = getDb();

  if (userId) {
    const { conditions, params } = buildUserViewConditions({ status, source, type, collectionId });

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
        params.push(decoded.created_at, decoded.created_at, decoded.id);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = d
      .prepare(`SELECT * FROM (${USER_ITEMS_VIEW}) ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(userId, userId, ...params, limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(deserializeUserViewItem);
    const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null;

    return { items, nextCursor, hasMore };
  }

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

function getItemCount({ status, source, collectionId, userId } = {}) {
  const d = getDb();

  if (userId) {
    const { conditions, params } = buildUserViewConditions({ status, source, collectionId });
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return d
      .prepare(`SELECT COUNT(*) as count FROM (${USER_ITEMS_VIEW}) ${where}`)
      .get(userId, userId, ...params).count;
  }

  const { conditions, params } = buildItemConditions({ status, source, collectionId });
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return d.prepare(`SELECT COUNT(*) as count FROM items ${where}`).get(...params).count;
}

// ─── User matches CRUD (v7.1 dedup corpus) ───────────────────

function upsertUserMatch({ userId, itemId, score = null, status = 'new' }) {
  const d = getDb();
  d.prepare(`
    INSERT INTO user_matches (user_id, item_id, score, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET
      score  = COALESCE(excluded.score, user_matches.score),
      status = excluded.status
  `).run(userId, itemId, score, status);
}

function getUserMatch(userId, itemId) {
  const d = getDb();
  return d.prepare('SELECT * FROM user_matches WHERE user_id = ? AND item_id = ?').get(userId, itemId) || null;
}

function deleteUserMatch(userId, itemId) {
  const d = getDb();
  return d.prepare('DELETE FROM user_matches WHERE user_id = ? AND item_id = ?').run(userId, itemId).changes > 0;
}

// Personal status lives in user_matches for shared internet content;
// private collections keep status on the item row itself
function setItemStatusForUser(itemId, userId, status) {
  const item = getItemById(itemId);
  if (!item) return false;
  if (item.collection_id === 'internet' && userId) {
    upsertUserMatch({ userId, itemId, status });
    return true;
  }
  return updateItemStatus(itemId, status);
}

// True if the user is allowed to act on this item:
// shared internet content — anyone authenticated; private — owner only
function userCanAccessItem(item, userId) {
  if (!item) return false;
  if (item.collection_id === 'internet') return true;
  return !item.user_id || item.user_id === userId;
}

// ─── Onboarding (Phase 2.6) ──────────────────────────────────
// Seed a new user's inbox with welcome messages on first login. Stored once in
// the shared corpus (content-deduped, id is the PRIMARY KEY) — each user just
// gets their own user_matches row, so messages appear per-user, never duplicated.

function seedWelcomeForUser(userId) {
  for (const msg of WELCOME_MESSAGES) {
    insertItem({
      id: msg.id,
      content: msg.content,
      type: 'post',
      source: 'system',
      metadata: { title: msg.title, system: true },
      collectionId: 'internet',
    });
    upsertUserMatch({ userId, itemId: msg.id, status: 'new' });
  }
  return WELCOME_MESSAGES.length;
}

// ─── Settings (Phase 3) ──────────────────────────────────────
// Normalized key-value store with typed values. Partial updates, simple
// migrations of individual keys. Read by config with .env fallback (Phase 3).

function serializeSettingValue(value, type) {
  if (value == null) return null;
  if (type === 'json') return JSON.stringify(value);
  return String(value);
}

function parseSettingValue(row) {
  if (!row) return undefined; // key not set
  const { value, type } = row;
  if (value == null) return null;
  switch (type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return value === 'true' || value === '1';
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    default:
      return value;
  }
}

function getSetting(key) {
  const d = getDb();
  return parseSettingValue(d.prepare('SELECT value, type FROM settings WHERE key = ?').get(key));
}

function getAllSettings() {
  const d = getDb();
  const out = {};
  for (const row of d.prepare('SELECT key, value, type FROM settings').all()) {
    out[row.key] = parseSettingValue(row);
  }
  return out;
}

function setSetting(key, value, type = 'string') {
  const d = getDb();
  d.prepare(`
    INSERT INTO settings (key, value, type, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type, updated_at = datetime('now')
  `).run(key, serializeSettingValue(value, type), type);
}

function resetSettings() {
  const d = getDb();
  return d.prepare('DELETE FROM settings').run().changes;
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
  const userId = options.userId || null;
  const query = keywords
    .filter(Boolean)
    .map((k) => `"${k.replace(/"/g, '""')}"`)
    .join(' OR ');

  if (!query.trim()) return [];

  try {
    const whereClauses = ['chunks_fts MATCH ?'];
    const params = [query];

    appendVisibilityClauses(whereClauses, params, collectionId, userId);
    params.push(limit);

    const sql = `
      SELECT c.*, chunks_fts.rank
      FROM chunks_fts
      JOIN chunks c ON c.rowid = chunks_fts.rowid
      JOIN items i ON c.parent_id = i.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY rank
      LIMIT ?`;

    return d.prepare(sql).all(...params).map((row) => ({
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

// ─── Users CRUD ──────────────────────────────────────────────

function createUser({ id, email, passwordHash }) {
  const d = getDb();
  d.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, email, passwordHash);
  return { id, email };
}

function findUserByEmail(email) {
  const d = getDb();
  return d.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

function findUserById(id) {
  const d = getDb();
  return d.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function getAllUsers() {
  const d = getDb();
  return d.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
}

// ─── Per-user profiles ────────────────────────────────────────

function getProfileByUserId(userId) {
  const d = getDb();
  const row = d.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!row) return null;
  return { ...row, keywords: row.keywords ? JSON.parse(row.keywords) : [] };
}

function saveProfileForUser(userId, profile) {
  const d = getDb();
  const existing = d.prepare('SELECT id FROM profiles WHERE user_id = ?').get(userId);
  if (existing) {
    d.prepare(`
      UPDATE profiles SET keywords = ?, vector = ?, raw_input = ? WHERE user_id = ?
    `).run(
      JSON.stringify(profile.keywords || []),
      profile.vector || null,
      profile.rawInput || '',
      userId,
    );
  } else {
    d.prepare(`
      INSERT INTO profiles (id, user_id, keywords, vector, raw_input) VALUES (?, ?, ?, ?, ?)
    `).run(
      profile.id || `user-${userId}`,
      userId,
      JSON.stringify(profile.keywords || []),
      profile.vector || null,
      profile.rawInput || '',
    );
  }
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

// Visibility rule (v7.1): the internet corpus is shared between users;
// private collections (files, __temp_*) are visible to their owner only.
function appendVisibilityClauses(whereClauses, params, collectionId, userId) {
  if (collectionId === 'internet') {
    whereClauses.push("i.collection_id = 'internet'");
  } else if (collectionId) {
    whereClauses.push('i.collection_id = ?');
    params.push(collectionId);
    if (userId) {
      whereClauses.push('i.user_id = ?');
      params.push(userId);
    }
  } else if (userId) {
    whereClauses.push("(i.collection_id = 'internet' OR i.user_id = ?)");
    params.push(userId);
  }
}

function getAllChunksWithVectors(options = {}) {
  const d = getDb();
  const collectionId = options.collectionId || null;
  const userId = options.userId || null;
  const params = [];

  if (collectionId || userId) {
    const whereClauses = ['c.vector IS NOT NULL'];
    appendVisibilityClauses(whereClauses, params, collectionId, userId);

    return d.prepare(
      `SELECT c.* FROM chunks c JOIN items i ON c.parent_id = i.id WHERE ${whereClauses.join(' AND ')}`
    ).all(...params).map((row) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : {} }));
  }

  return d.prepare('SELECT * FROM chunks WHERE vector IS NOT NULL').all()
    .map((row) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : {} }));
}

// Last N chunk vectors of the shared internet corpus — the comparison window
// for semantic near-dedup at ingest (v7.1)
function getRecentInternetChunkVectors(limit = 200) {
  const d = getDb();
  return d
    .prepare(`
      SELECT c.vector
        FROM chunks c JOIN items i ON c.parent_id = i.id
       WHERE i.collection_id = 'internet' AND c.vector IS NOT NULL
       ORDER BY c.created_at DESC, c.rowid DESC
       LIMIT ?
    `)
    .all(limit)
    .map((row) => row.vector);
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
  backfillInternetCorpus,
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
  // User matches (v7.1 dedup corpus)
  upsertUserMatch,
  getUserMatch,
  deleteUserMatch,
  setItemStatusForUser,
  userCanAccessItem,
  seedWelcomeForUser,
  // Settings (Phase 3)
  getSetting,
  getAllSettings,
  setSetting,
  resetSettings,
  // Chunks
  insertChunk,
  insertChunksBatch,
  getChunksByParent,
  deleteChunksByParent,
  chunksSearch,
  getAllChunksWithVectors,
  getRecentInternetChunkVectors,
  // Profiles
  saveProfile,
  getProfile,
  getAllProfiles,
  deleteProfile,
  getActiveProfile,
  getProfileByUserId,
  saveProfileForUser,
  // Users
  createUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
  // Config
  getChunkingConfig,
  updateChunkingConfig,
};

