 Ось PLAN v5.1 як diff до v5.0 — тільки те, що змінюється або додається.

---

# Universal Matching Engine — PLAN v5.1 (Diff to v5.0)

## Зміни в розділах v5.0

### 3.3 Hybrid Search Engine — ЗАМІНИТИ

**Було:**
```javascript
async function findRelevant(dataBatch, profile, threshold) {
  const keywordResults = await db.ftsSearch(profile.keywords)
  const semanticResults = await cosineSimilaritySearch(dataBatch, profile.vector, threshold)
  return mergeResults(keywordResults, semanticResults, {
    keywordWeight: 0.4,
    semanticWeight: 0.6
  })
}
```

**Стало:**
```javascript
async function findRelevant(dataBatch, profile, options = {}) {
  const mode = options.mode || 'sequential';
  const threshold = options.threshold || 0.65;
  const batchSize = options.batchSize || 20;
  
  if (mode === 'sequential') {
    // Етап 1: BM25 швидкий фільтр
    const bm25Results = await db.ftsSearch(profile.keywords, { 
      limit: options.maxBm25Results || 100 
    });
    // Етап 2: Embeddings тільки для BM25 результатів
    const semanticResults = await batchEmbeddingSearch(
      bm25Results, profile.vector, { threshold, batchSize }
    );
    return semanticResults;
  } else {
    // Parallel: обидва алгоритми незалежно
    const [bm25Results, semanticResults] = await Promise.all([
      db.ftsSearch(profile.keywords),
      batchEmbeddingSearch(dataBatch, profile.vector, { threshold, batchSize })
    ]);
    return mergeResults(bm25Results, semanticResults, {
      keywordWeight: options.bm25Weight || 0.4,
      semanticWeight: options.semanticWeight || 0.6
    });
  }
}
```

---

### 3.5 Dual Input UI — РОЗШИРИТИ

**Додати після keywords editor:**

```
┌─────────────────────────────────────────────────────┐
│  SEARCH MODE                                        │
│  [● Sequential] [○ Parallel]                        │
├─────────────────────────────────────────────────────┤
│  WEIGHTS (Parallel mode only)                       │
│  BM25        [████░░░░░░] 0.4                       │
│  Semantic    [██████░░░░] 0.6                       │
├─────────────────────────────────────────────────────┤
│  ADVANCED                                           │
│  Threshold:   [0.65]                                │
│  Batch size:  [20]                                  │
│  Max BM25:    [100] (Sequential only)               │
└─────────────────────────────────────────────────────┘
```

---

### 4. Стек — ДОДАТИ

| Шар | Було | Стало |
|-----|------|-------|
| Embeddings | `@xenova/transformers` | **`@huggingface/transformers` v4** |
| Фронтенд | plain HTML + vanilla JS | **React 19 + Vite + Tailwind v4** |
| State (client) | — | **Zustand** |
| State (server) | — | **TanStack Query** |

---

### 5. Структура файлів — ДОДАТИ

```
Додати:
  /src
    profile-generator.js    ← НОВИЙ
    keyword-extractor.js    ← НОВИЙ
    reranker.js             ← НОВИЙ
    explainer.js            ← НОВИЙ
  /client                   ← НОВА ПАПКА (React фронтенд)
    /src
      /components
      /hooks
      /stores
      /api
  /__tests__
    profile-generator.test.js   ← НОВИЙ
    hybrid-search.test.js       ← НОВИЙ
    reranker.test.js            ← НОВИЙ

Замінити:
  /public/index.html            ← legacy UI, залишити як fallback
```

---

### 6. База даних — ДОДАТИ ТАБЛИЦЮ

```sql
-- НОВА таблиця для збережених профілів
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  keywords TEXT,           -- JSON array
  vector BLOB,             -- serialized embedding
  raw_input TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

### 8. PIPELINE v5 — ЗАМІНИТИ

**Було:**
```
INPUT TEXT
    ↓
Profile Generator
    ├── Keyword Extractor → keywords
    └── Embedding Generator → vector
    ↓
[Людина редагує keywords]
    ↓
Hybrid Search
    ├── BM25
    └── Cosine Similarity
    ↓
Merge Results (40% BM25 + 60% semantic)
```

**Стало:**
```
INPUT TEXT
    ↓
Profile Generator
    ├── Keyword Extractor → keywords
    └── Embedding Generator → vector
    ↓
[Людина редагує keywords]
    ↓
[Людина обирає mode: Sequential/Parallel, налаштовує ваги]
    ↓
Hybrid Search
    ├── Sequential: BM25 → Embeddings(batch) для підмножини
    └── Parallel: BM25 + Embeddings(batch) незалежно → Merge
    ↓
Reranker
    ↓
Explainer
    ↓
UI: результати з поясненнями
    ↓
[Approve / Skip / Edit]
```

---

### 8.5 API — ДОДАТИ ЕНДПОІНТ

**НОВИЙ:** `POST /api/search` приймає параметри з UI

```javascript
// Request (НОВЕ)
{
  "query": "...",
  "profileId": "prof_abc123",
  "mode": "sequential",              // ← НОВЕ
  "weights": { "bm25": 0.4, "semantic": 0.6 },  // ← НОВЕ
  "threshold": 0.65,                 // ← НОВЕ (був фіксований)
  "batchSize": 20,                    // ← НОВЕ
  "maxBm25Results": 100,            // ← НОВЕ
  "dataSource": "all",
  "topN": 20
}

// Response (РОЗШИРЕНЕ)
{
  "results": [...],
  "stats": {
    "mode": "sequential",              // ← НОВЕ
    "bm25Results": 50,                // ← НОВЕ
    "semanticProcessed": 50,          // ← НОВЕ
    "duration": 3200
  }
}
```

---

### 9. ADR — ДОДАТИ

```markdown
# ADR-004: Batch Embeddings Processing

## Проблема
Promise.all на 200+ embeddings перевантажує ONNX Runtime thread pool.

## Рішення
Batch processing з конфігурованим розміром (default 20).

## Trade-offs
+ Оптимальне використання CPU
+ Контроль над memory pressure
- Трохи повільніше ніж ідеальний parallel (але стабільніше)
```

---

### 10. Acceptance Criteria — ДОДАТИ

**Додати до Фази 3б:**
- [ ] `POST /api/search` приймає `mode`, `weights`, `threshold`, `batchSize`
- [ ] Sequential mode: embeddings тільки для BM25 результатів
- [ ] Parallel mode: BM25 + embeddings незалежно, weighted merge
- [ ] Batch processing: `batchSize` конфігурується, default 20
- [ ] Таймінг логи для кожного batch окремо

**Додати Фазу 5б — React UI:**
- [ ] Zustand store для search параметрів (mode, weights, threshold)
- [ ] TanStack Query для server state
- [ ] Компонент `SearchWeights`: mode toggle, слайдери ваг
- [ ] Компонент `SyncButton`: показує прогрес, не "Sync started"
- [ ] `FileUploader`: drag&drop PDF/DOCX/TXT

---

### 11. Що не входить — БЕЗ ЗМІН

Все з v5.0 залишається як є.

---

## Нові файли (повний код)

### src/search-engine.js — batchEmbeddingSearch

```javascript
const DEFAULT_BATCH_SIZE = 20;

async function batchEmbeddingSearch(items, profileVector, options = {}) {
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const startTime = performance.now();
    
    const embeddings = await Promise.all(
      batch.map(item => generateEmbedding(item.content))
    );
    
    logger.info({
      batch: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(items.length / batchSize),
      batchSize: batch.length,
      duration: Math.round(performance.now() - startTime)
    }, 'Embedding batch complete');

    for (let j = 0; j < batch.length; j++) {
      const score = cosineSimilarity(embeddings[j], profileVector);
      if (score >= options.threshold) {
        results.push({ ...batch[j], score });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
```

### client/src/stores/searchStore.js

```javascript
import { create } from 'zustand';

export const useSearchStore = create((set) => ({
  mode: 'sequential',
  bm25Weight: 0.4,
  semanticWeight: 0.6,
  threshold: 0.65,
  batchSize: 20,
  maxBm25Results: 100,
  
  setMode: (mode) => set({ mode }),
  setWeights: (bm25, semantic) => {
    if (bm25 + semantic !== 1.0) throw new Error('Weights must sum to 1.0');
    set({ bm25Weight: bm25, semanticWeight: semantic });
  },
  setThreshold: (t) => set({ threshold: t }),
  setBatchSize: (size) => set({ batchSize: size }),
}));
```

---

**Це diff. Що незрозуміло — питай.**