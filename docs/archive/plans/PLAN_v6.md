# Universal Matching Engine — PLAN v6.0

## 1. ЩО ЗМІНИЛОСЬ ВІДНОСНО v5

v5 — dynamic profile generation + hybrid search + reranking.
v6 — додає повноцінний chunking layer з трьома стратегіями і UI перемикачем.

Ключова зміна: **довгі документи (резюме, контракти, статті) тепер обробляються коректно**.
Без chunking — MiniLM мовчки обрізає текст після 256 токенів. З chunking — весь документ індексується повністю.

---

## 2. ЩО БУДУЄМО (повна картина)

```
INPUT TEXT (вакансія / опис / запит)
    ↓
Profile Generator
    ├── Keyword Extractor (AI або функція)
    └── Embedding Generator → вектор запиту
    ↓
[Людина редагує keywords якщо треба]
    ↓
──────────────────────────────────────
DATA PROCESSING (відбувається при upload)
──────────────────────────────────────
Документи (резюме / пости / контракти)
    ↓
Chunker [стратегія обирається в UI]
    ├── Fixed Size (з overlap)
    ├── Semantic (по абзацах/секціях)
    └── Hierarchical (summary + chunks)
    ↓
Кожен chunk → Embedding → збереження в chunks table
──────────────────────────────────────
SEARCH
──────────────────────────────────────
    ↓
Hybrid Search
    ├── BM25 (SQLite FTS5) по keywords → знаходить chunks
    └── Cosine Similarity по векторах → знаходить chunks
    ↓
Merge Results (weighted)
    ↓
Reranker (топ-50 chunks → топ-20)
    ↓
Group by parent document → повертає цілі документи
    ↓
Explainer (чому кожен документ релевантний)
    ↓
UI: результати з поясненнями
    ↓
[Approve / Skip / Edit] → Action Dispatcher
```

---

## 3. АРХІТЕКТУРА CHUNKING

### 3.1 Три стратегії

#### Стратегія 1: Fixed Size

Найпростіша. Розбиває по кількості слів з overlap.

```javascript
// /src/chunker/fixed.js

function chunkFixed(text, options = {}) {
  const { chunkSize = 200, overlap = 50 } = options
  const words = text.split(/\s+/)
  const chunks = []

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ')
    if (chunk.trim().length > 0) {
      chunks.push({
        content: chunk,
        chunkIndex: chunks.length,
        strategy: 'fixed',
        metadata: { start: i, end: Math.min(i + chunkSize, words.length) }
      })
    }
  }
  return chunks
}
```

**Коли використовувати:** пости, коментарі, короткі тексти без чіткої структури.
**Переваги:** швидко, передбачувано, без залежностей.
**Недоліки:** може розрізати речення або думку посередині.

---

#### Стратегія 2: Semantic (по абзацах і секціях)

Розбиває по реальних межах тексту — абзацах, секціях, реченнях.

```javascript
// /src/chunker/semantic.js

function chunkSemantic(text, options = {}) {
  const { maxChunkSize = 300, minChunkSize = 50 } = options

  // Крок 1: розбити по секціях (заголовки типу "Experience:", "Skills:")
  const sections = splitBySections(text)

  // Крок 2: якщо секція завелика — розбити по абзацах
  const chunks = []
  for (const section of sections) {
    if (countWords(section.content) <= maxChunkSize) {
      chunks.push({ ...section, strategy: 'semantic' })
    } else {
      const paragraphs = splitByParagraphs(section.content)
      chunks.push(...paragraphs.map(p => ({
        content: p,
        sectionTitle: section.title,
        strategy: 'semantic'
      })))
    }
  }

  // Крок 3: злити занадто маленькі chunks
  return mergeSmallChunks(chunks, minChunkSize)
}

function splitBySections(text) {
  // Розпізнає патерни: "Experience:", "## Skills", "ОСВІТА" тощо
  const sectionPattern = /^(#{1,3}\s+.+|[A-ZА-ЯІЇЄ][A-ZА-ЯІЇЄ\s]+:)/gm
  // ...
}
```

**Коли використовувати:** резюме, статті, технічні документи зі структурою.
**Переваги:** chunks відповідають реальним смисловим блокам.
**Недоліки:** складніше реалізувати, залежить від якості структури тексту.

---

#### Стратегія 3: Hierarchical

Два рівні векторів. Summary всього документа + chunks секцій.

```javascript
// /src/chunker/hierarchical.js

async function chunkHierarchical(text, options = {}) {
  // Рівень 1: summary всього документа (через AI)
  const summary = await generateSummary(text)
  const summaryChunk = {
    content: summary,
    level: 'document',
    chunkIndex: 0,
    strategy: 'hierarchical'
  }

  // Рівень 2: semantic chunks секцій
  const sectionChunks = chunkSemantic(text, options).map(chunk => ({
    ...chunk,
    level: 'section'
  }))

  return [summaryChunk, ...sectionChunks]
}

async function generateSummary(text) {
  // Groq API: "summarize this document in 3-5 sentences"
  // Результат — короткий опис всього документа для пошуку на рівні документа
}
```

**Коли використовувати:** довгі контракти, звіти, технічна документація.
**Переваги:** пошук працює на двох рівнях — знаходить і за загальним змістом і за деталями.
**Недоліки:** додатковий API call для summary, повільніше при upload.

---

### 3.2 Chunker як уніфікований інтерфейс

```javascript
// /src/chunker/index.js

const strategies = {
  fixed:        require('./fixed'),
  semantic:     require('./semantic'),
  hierarchical: require('./hierarchical'),
}

async function chunk(text, strategy = 'semantic', options = {}) {
  // Короткі тексти — не чіпаємо
  if (countTokens(text) <= 200) {
    return [{
      content: text,
      chunkIndex: 0,
      strategy: 'none'
    }]
  }

  const chunker = strategies[strategy]
  if (!chunker) throw new AppError(`Unknown strategy: ${strategy}`, 'INVALID_STRATEGY')

  return chunker(text, options)
}

module.exports = { chunk }
```

Решта системи викликає тільки `chunk()` — не знає яка стратегія активна.

---

## 4. ЗМІНИ В БАЗІ ДАНИХ

### Нова таблиця: chunks

```sql
CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,        -- hash від parentId + chunkIndex
  parent_id   TEXT NOT NULL,           -- items.id
  content     TEXT NOT NULL,           -- текст chunk
  chunk_index INTEGER NOT NULL,        -- порядковий номер
  level       TEXT DEFAULT 'section',  -- 'document' | 'section' (hierarchical)
  strategy    TEXT NOT NULL,           -- 'fixed' | 'semantic' | 'hierarchical' | 'none'
  vector      BLOB,                    -- серіалізований Float32Array
  metadata    TEXT,                    -- JSON: sectionTitle, start, end
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE CASCADE
)
```

### FTS5 індекс на chunks (не на items)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
USING fts5(content, content='chunks', content_rowid='rowid', tokenize='porter unicode61')
```

### Нова таблиця: chunking_config

```sql
CREATE TABLE IF NOT EXISTS chunking_config (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  strategy      TEXT NOT NULL DEFAULT 'semantic',
  chunk_size    INTEGER DEFAULT 200,
  overlap       INTEGER DEFAULT 50,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Одна строка. Зберігає активну конфігурацію яку людина обрала в UI.

---

## 5. ЗМІНИ В SEARCH ENGINE

```javascript
// /src/search-engine.js

async function findRelevant(profile, threshold = 0.65) {
  // Крок 1: BM25 по chunks
  const keywordChunks = await db.chunksSearch(profile.keywords)

  // Крок 2: Cosine similarity по chunks
  const allChunks = await db.getAllChunks()
  const semanticChunks = allChunks.filter(
    chunk => cosineSimilarity(deserializeVector(chunk.vector), profile.vector) > threshold
  )

  // Крок 3: Merge chunks
  const mergedChunks = mergeResults(keywordChunks, semanticChunks, {
    keywordWeight: 0.4,
    semanticWeight: 0.6
  })

  // Крок 4: Group by parent document
  const documentMap = new Map()
  for (const chunk of mergedChunks) {
    if (!documentMap.has(chunk.parent_id)) {
      documentMap.set(chunk.parent_id, {
        item: await db.getItem(chunk.parent_id),
        matchedChunks: [],
        bestScore: 0
      })
    }
    const doc = documentMap.get(chunk.parent_id)
    doc.matchedChunks.push(chunk)
    doc.bestScore = Math.max(doc.bestScore, chunk.score)
  }

  // Крок 5: Повертаємо документи відсортовані по bestScore
  return Array.from(documentMap.values())
    .sort((a, b) => b.bestScore - a.bestScore)
}
```

---

## 6. UI — CHUNKING SWITCHER

### Новий блок в index.html

```
┌─────────────────────────────────────────────────────┐
│  QUERY INPUT                                        │
│  [                                            ] [→] │
├─────────────────────────────────────────────────────┤
│  AI KEYWORDS                                        │
│  [Node.js ×] [senior ×] [remote ×] [+ додати]      │
├─────────────────────────────────────────────────────┤
│  CHUNKING STRATEGY                                  │
│  ○ Fixed     ● Semantic     ○ Hierarchical          │
│                                                     │
│  Chunk size: [200] words   Overlap: [50] words      │
│                                                     │
│  ℹ Fixed: fast, for short texts                    │
│    Semantic: best for resumes and articles          │
│    Hierarchical: for long contracts and reports     │
├─────────────────────────────────────────────────────┤
│  DATA INPUT                                         │
│  [Upload files] або [Connect source]                │
└─────────────────────────────────────────────────────┘
```

### API endpoint для збереження конфігурації

```javascript
// POST /api/config/chunking
app.post('/api/config/chunking', (req, res) => {
  const { strategy, chunkSize, overlap } = req.body
  db.updateChunkingConfig({ strategy, chunkSize, overlap })
  res.json({ success: true })
})

// GET /api/config/chunking
app.get('/api/config/chunking', (req, res) => {
  res.json(db.getChunkingConfig())
})
```

---

## 7. НОВІ ФАЙЛИ (додаються до структури v5)

```
/src
  /chunker
    index.js              — уніфікований інтерфейс chunk()
    fixed.js              — Fixed Size стратегія
    semantic.js           — Semantic стратегія
    hierarchical.js       — Hierarchical стратегія
    utils.js              — countTokens, mergeSmallChunks, splitBySections
  profile-generator.js    — з v5
  keyword-extractor.js    — з v5
  reranker.js             — з v5
  explainer.js            — з v5
  /sources
    file-upload.js        — з v5
/__tests__
  /chunker
    fixed.test.js
    semantic.test.js
    hierarchical.test.js
    index.test.js         — тест переключення стратегій
  hybrid-search.test.js
  profile-generator.test.js
/docs
  /adr
    001-hybrid-search.md
    002-dynamic-profiles.md
    003-reranking-strategy.md
    004-chunking-strategies.md   — NEW: чому три стратегії і як обирати
```

---

## 8. ПОРЯДОК ПОБУДОВИ — НОВІ ФАЗИ

(Фази 0-7 з v4 залишаються. Додаються нові.)

### Фаза 3д — Chunker

**Що робимо:**
1. `chunker/utils.js` — countTokens, splitBySections, splitByParagraphs, mergeSmallChunks
2. `chunker/fixed.js` — Fixed Size з overlap
3. `chunker/semantic.js` — Semantic по секціях і абзацах
4. `chunker/hierarchical.js` — Hierarchical з AI summary
5. `chunker/index.js` — уніфікований інтерфейс
6. Нові таблиці в `db.js`: chunks, chunks_fts, chunking_config

**✅ Acceptance Criteria:**
- [ ] `chunker/fixed.test.js` — текст 500 слів → chunks по 200 слів з overlap 50
- [ ] `chunker/fixed.test.js` — текст 100 слів → один chunk без розбивки
- [ ] `chunker/semantic.test.js` — резюме з секціями → chunk per секція
- [ ] `chunker/semantic.test.js` — текст без секцій → розбивка по абзацах
- [ ] `chunker/hierarchical.test.js` — повертає summary chunk на рівні 'document'
- [ ] `chunker/hierarchical.test.js` — mock Groq API для summary generation
- [ ] `chunker/index.test.js` — текст <= 200 токенів → стратегія 'none', один chunk
- [ ] `chunker/index.test.js` — невідома стратегія → AppError з кодом INVALID_STRATEGY
- [ ] chunks зберігаються в БД з правильним parent_id
- [ ] chunks_fts індексується при insert
- [ ] ON DELETE CASCADE — видалення item видаляє всі його chunks

### Фаза 3е — Search по chunks

**Що робимо:**
1. Розширити `search-engine.js` — пошук по chunks, group by parent
2. Розширити `db.js` — chunksSearch, getAllChunks, getChunksByParent

**✅ Acceptance Criteria:**
- [ ] `hybrid-search.test.js` — пошук повертає items (не chunks)
- [ ] `hybrid-search.test.js` — item з 3 релевантних chunks і item з 1 — перший вище
- [ ] `hybrid-search.test.js` — дублікати по parent_id відсутні в результатах
- [ ] `hybrid-search.test.js` — matchedChunks містить які саме chunks спрацювали

### Фаза 5б — UI Chunking Switcher

**Що робимо:**
1. Блок вибору стратегії в `index.html`
2. Поля chunk size і overlap (активні тільки для Fixed)
3. Підказки для кожної стратегії
4. `POST /api/config/chunking` + `GET /api/config/chunking`

**✅ Acceptance Criteria:**
- [ ] Перемикання стратегії зберігається в БД
- [ ] Після перезапуску сервера — активна та сама стратегія
- [ ] Поля chunk size і overlap disabled для Semantic і Hierarchical
- [ ] Підказка пояснює коли використовувати кожну стратегію
- [ ] `server.test.js` — POST /api/config/chunking з невалідною стратегією → 400

---

## 9. ADR-004: Chunking Strategies

```markdown
# ADR-004: Три стратегії chunking

## Проблема
MiniLM-L6-v2 має ліміт 256 токенів (~200 слів).
Резюме, контракти, статті — значно довші.
Обрізання тексту = втрата інформації = погана якість пошуку.

## Альтернативи розглянуті
1. Одна фіксована стратегія — не підходить для різних типів документів
2. Тільки semantic — складніше, не завжди є структура
3. Три стратегії з UI перемикачем — гнучко, людина обирає під задачу

## Рішення
Три стратегії за зростанням складності:
- Fixed: швидко, для текстів без структури
- Semantic: оптимально для більшості документів
- Hierarchical: для довгих структурованих документів

## Trade-offs
+ Людина контролює як індексуються її документи
+ Можна порівняти результати між стратегіями
- Hierarchical потребує додаткового API call для summary
- Три стратегії = більше тестів

## Коли переглянути
Якщо з'явиться better-sqlite3 підтримка векторного пошуку
або якщо перейдемо на pgvector.
```

---

## 10. PRODUCTION-READY CHECKLIST (оновлений)

| # | Item | Фаза |
|---|------|------|
| 1-20 | Всі пункти з v4 | 0-7 |
| 21 | Dynamic Profile Generator | 3б |
| 22 | Keyword Extractor (AI + fallback функція) | 3б |
| 23 | SQLite FTS5 hybrid search | 3б |
| 24 | Reranker з rate limiting | 3в |
| 25 | Chunker Fixed strategy | 3д |
| 26 | Chunker Semantic strategy | 3д |
| 27 | Chunker Hierarchical strategy | 3д |
| 28 | chunks таблиця з CASCADE delete | 3д |
| 29 | Search по chunks з group by parent | 3е |
| 30 | UI chunking switcher | 5б |
| 31 | Chunking config persistence | 5б |
| 32 | ADR документи для всіх ключових рішень | ongoing |

---

## 11. ЩО НЕ ВХОДИТЬ В v6 (але архітектура готова)

- Автоматичний вибір стратегії по типу документа (ML classifier)
- Re-chunking існуючих документів при зміні стратегії
- Візуалізація chunks в UI (показати як документ розбитий)
- Порівняння результатів між стратегіями side-by-side
- Cohere Rerank API заміна self-hosted reranker
- pgvector міграція для corpus > 100K документів
- Multi-tenant підтримка
