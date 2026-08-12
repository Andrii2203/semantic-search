# Universal Matching Engine — PLAN v6.1 (Diff to v6.0)

## Архітектурні покращення

### 1. Sequential Mode як Default (замість Parallel)

**Було (v6.0):** `getAllChunks()` завантажує ВСІ chunks в RAM для cosine similarity.

**Стало:** Sequential mode — BM25 фільтрує спочатку, cosine similarity тільки для відфільтрованих chunks. Vectors зберігаються в chunks table при upload, не генеруються при пошуку.

---

### 2. Shared GroqClient з Rate Limiter

**Було:** Кожен модуль створює свій Groq клієнт.

**Стало:** Один `src/groq-client.js` з вбудованим rate limiter, який шарять:
- Keyword Extractor
- Reranker
- Explainer
- Hierarchical Chunker

```javascript
// src/groq-client.js
class GroqClient {
  constructor() { /* single Groq SDK instance + shared timestamps[] */ }
  async waitForSlot() { /* rate limiting logic */ }
  async chat(messages, options) { /* await slot, then call API */ }
}
// Singleton pattern
```

---

### 3. FTS5 Sync через SQLite Triggers

**Було:** Ручний insert в chunks + chunks_fts окремо.

**Стало:** Triggers автоматично синхронізують FTS5 індекс:

```sql
CREATE TRIGGER chunks_fts_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER chunks_fts_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) 
  VALUES('delete', old.rowid, old.content);
END;
```

---

### 4. Keyword Extractor — Instant Fallback + Async AI

**Було:** Тільки AI extraction (повільно).

**Стало:**
1. `extractKeywordsFallback(text)` — миттєво, TF + стоп-слова
2. `extractKeywords(text)` — Groq AI, точніше
3. UI показує fallback keywords миттєво, AI оновлює через 1-2с

---

### 5. Lazy Explanations (On-Click)

**Було:** Explanation для кожного результату при пошуку (20 Groq calls).

**Стало:** Результати показуються без explanation. Кнопка "Why this match?" генерує explanation on-demand для конкретного результату.

---

### 6. Re-chunk Endpoint

**Було:** "Re-chunking — не входить в v6."

**Стало:** `POST /api/rechunk` — перечанкує існуючі items з новою стратегією. UI показує warning при зміні стратегії.

---

### 7. Stored Vectors — No Re-generation

**Було (v5.1):** `batchEmbeddingSearch` генерує embeddings на льоту.

**Стало:** Vectors генеруються один раз при upload/chunking і зберігаються в chunks.vector BLOB. При пошуку — тільки cosine similarity з збереженими vectors. Значно швидше.

---

## Нові файли (додаються до v6.0)

```
/src
  groq-client.js          ← НОВИЙ: shared Groq client + rate limiter
```

## Змінені Acceptance Criteria

- [ ] Sequential mode використовує збережені vectors, не генерує нові
- [ ] Один GroqClient instance для всіх AI модулів
- [ ] FTS5 автоматично синхронізується через triggers
- [ ] Keyword fallback працює без Groq API
- [ ] Explanation генерується on-click, не автоматично
- [ ] POST /api/rechunk перечанкує items з новою стратегією
