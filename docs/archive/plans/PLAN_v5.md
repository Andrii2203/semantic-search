# Universal Matching Engine — PLAN v5.0

## 1. ЩО ЗМІНИЛОСЬ ВІДНОСНО v4

v4 — це semantic search engine з ручними profiles.
v5 — це universal matching engine де AI сам генерує профіль пошуку з будь-якого input.

Ключова зміна: **статичні profiles/*.json → динамічний Profile Generator**.

Людина описує що шукає → AI витягує keywords + будує embedding вектор → hybrid search → reranking → результат.

Все інше з v4 залишається як є. Архітектура, стек, фази 0-7 — фундамент не міняється.

---

## 2. ЩО БУДУЄМО

Universal Matching Engine який:
- Приймає будь-який input (вакансія, опис проекту, технічне завдання, скарга клієнта)
- Сам генерує профіль пошуку через AI — keywords + embedding вектор
- Робить hybrid search: BM25 (keywords) + cosine similarity (embeddings)
- Reranking фінальних результатів для точності
- Показує результати з поясненням чому кожен підходить
- Людина редагує keywords, approves результати — human-in-the-loop збережено

Одне ядро. Необмежена кількість вертикалей через упаковку.

---

## 3. НОВІ АРХІТЕКТУРНІ ІДЕЇ (додаються до v4)

### 3.1 Dynamic Profile Generator

Замість статичних profiles/*.json — модуль який генерує профіль на льоту.

```javascript
// /src/profile-generator.js

const ProfileGenerator = {
  async fromText(inputText) {
    // 1. AI витягує ключові слова
    const keywords = await extractKeywords(inputText)

    // 2. Будуємо embedding вектор з input тексту
    const vector = await SearchEngine.generateEmbedding(inputText)

    return {
      id: hashContent(inputText),
      keywords,          // ["Node.js", "PostgreSQL", "senior", "remote"]
      vector,            // embedding для cosine similarity
      rawInput: inputText,
      createdAt: new Date().toISOString()
    }
  }
}
```

Profiles/*.json залишаються як збережені шаблони — але більше не є обов'язковими.

---

### 3.2 Keyword Extractor (AI-powered)

```javascript
// /src/keyword-extractor.js

async function extractKeywords(text) {
  const response = await groq.chat({
    messages: [{
      role: "user",
      content: `
        Extract search keywords from this text.
        Return ONLY a JSON array of strings.
        Include: skills, technologies, seniority, domain terms.
        Text: ${text}
      `
    }]
  })
  return JSON.parse(response)
  // ["Node.js", "PostgreSQL", "senior", "API design", "remote"]
}
```

Людина бачить keywords в UI. Може додати, видалити, відредагувати перед пошуком.

---

### 3.3 Hybrid Search Engine

Розширення існуючого search-engine.js. Два паралельні кроки:

```javascript
// /src/search-engine.js — розширення findRelevant

async function findRelevant(dataBatch, profile, threshold) {
  // Крок 1: BM25 keyword search (через SQLite FTS5)
  const keywordResults = await db.ftsSearch(profile.keywords)

  // Крок 2: Semantic search (існуючий cosine similarity)
  const semanticResults = await cosineSimilaritySearch(dataBatch, profile.vector, threshold)

  // Крок 3: Merge і deduplicate з ваговими коефіцієнтами
  return mergeResults(keywordResults, semanticResults, {
    keywordWeight: 0.4,
    semanticWeight: 0.6
  })
}
```

SQLite FTS5 — не потрібно міняти стек. Працює в існуючому db.js.

---

### 3.4 Reranker

Фінальний крок після hybrid search. Бере топ-N результатів і ранжує точніше.

```javascript
// /src/reranker.js

async function rerank(results, originalQuery, topN = 20) {
  // Для кожного результату: AI оцінює пару (query, result) від 0 до 1
  const scored = await Promise.all(
    results.slice(0, topN).map(async (item) => ({
      ...item,
      rerankScore: await scoreRelevance(originalQuery, item.content)
    }))
  )
  return scored.sort((a, b) => b.rerankScore - a.rerankScore)
}
```

Опціонально: замінити на Cohere Rerank API якщо потрібна вища точність.

---

### 3.5 Dual Input UI

Замість одного поля пошуку — два:

```
┌─────────────────────────────────────────────────────┐
│  QUERY INPUT                                        │
│  Вставте вакансію, опис проекту, або будь-який текст│
│  [                                            ] [→] │
├─────────────────────────────────────────────────────┤
│  AI KEYWORDS (редагуються)                          │
│  [Node.js ×] [PostgreSQL ×] [senior ×] [+ додати]  │
├─────────────────────────────────────────────────────┤
│  DATA INPUT                                         │
│  Завантажте файли або підключіть джерело            │
│  [Upload 200 резюме] або [Підключити джерело]       │
└─────────────────────────────────────────────────────┘
```

Human-in-the-loop на рівні keywords — людина бачить і контролює що шукає система.

---

### 3.6 Result Explainer

Кожен результат містить пояснення чому він релевантний:

```javascript
{
  id: "abc123",
  content: "...",
  score: 0.87,
  rerankScore: 0.92,
  explanation: "Matches: Node.js (exact), PostgreSQL (exact), 
                senior level (inferred from '7 years experience'),
                missing: remote preference not mentioned"
}
```

---

## 4. НОВІ ФАЙЛИ (додаються до структури v4)

```
/src
  profile-generator.js    — динамічна генерація профілю з тексту
  keyword-extractor.js    — AI витягує keywords з input
  reranker.js             — фінальне ранжування результатів
  explainer.js            — генерує пояснення для кожного результату
  /sources
    file-upload.js        — завантаження локальних файлів (PDF, DOCX, TXT)
  /actions
    explain-match.js      — генерує explanation для approved items
/__tests__
  profile-generator.test.js
  keyword-extractor.test.js
  reranker.test.js
  hybrid-search.test.js
/docs
  /adr
    001-hybrid-search.md          — чому FTS5 замість pgvector
    002-dynamic-profiles.md       — чому генерація замість статичних JSON
    003-reranking-strategy.md     — чому reranking і коли Cohere
```

---

## 5. ЗМІНИ В db.js (SQLite FTS5)

```javascript
// Нова таблиця для full-text search
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS items_fts 
  USING fts5(content, tokenize='porter unicode61')
`)

// При insert в items — також insert в items_fts
function insertItem(item) {
  db.prepare(`INSERT INTO items VALUES (...)`).run(item)
  db.prepare(`INSERT INTO items_fts VALUES (?)`).run(item.content)
}

// BM25 пошук
function ftsSearch(keywords) {
  const query = keywords.join(' OR ')
  return db.prepare(`
    SELECT items.*, rank FROM items_fts 
    JOIN items ON items_fts.rowid = items.rowid
    WHERE items_fts MATCH ? 
    ORDER BY rank
  `).all(query)
}
```

---

## 6. PIPELINE v5

```
INPUT TEXT (вакансія / опис / запит)
    ↓
Profile Generator
    ├── Keyword Extractor (AI) → keywords для BM25
    └── Embedding Generator → вектор для cosine similarity
    ↓
[Людина редагує keywords якщо треба]
    ↓
Hybrid Search
    ├── BM25 (SQLite FTS5) по keywords
    └── Cosine Similarity по вектору
    ↓
Merge Results (weighted: 40% BM25 + 60% semantic)
    ↓
Reranker (топ-50 → топ-20)
    ↓
Explainer (чому кожен результат релевантний)
    ↓
UI: людина бачить результати з поясненнями
    ↓
[Approve / Skip / Edit]
    ↓
Action Dispatcher (як в v4)
```

---

## 7. ВЕРТИКАЛІ — одне ядро, різна упаковка

### Вертикаль 1: RecruitMatch (перша до ринку)
- Input: опис вакансії
- Data: пачка резюме (upload PDF/DOCX)
- Output: топ кандидатів з поясненням
- Action: draft email кандидату

### Вертикаль 2: ContentMatch
- Input: тема або briefing
- Data: пости, статті, джерела
- Output: релевантний контент для коментування
- Action: draft коментар (як в v4)

### Вертикаль 3: TenderScan
- Input: вимоги тендеру
- Data: внутрішні документи компанії
- Output: відповідні документи з gap analysis
- Action: draft відповідь на тендер

Технічно — той самий код. Комерційно — три різні продукти.

---

## 8. НОВІ ACCEPTANCE CRITERIA (додаються до v4)

### Фаза 3б — Hybrid Search
- [ ] FTS5 таблиця створюється автоматично при міграції
- [ ] ftsSearch повертає результати відсортовані по BM25 rank
- [ ] mergeResults коректно дедуплікує і зважує результати
- [ ] hybrid-search.test.js: однаковий item не з'являється двічі
- [ ] hybrid-search.test.js: keyword match без semantic match — item включається

### Фаза 3в — Profile Generator
- [ ] profile-generator.test.js: з будь-якого тексту генерується валідний profile
- [ ] keywords не порожні якщо input > 20 слів
- [ ] вектор має правильну розмірність (384 для MiniLM)
- [ ] збережений profile можна перевикористати без повторної генерації

### Фаза 3г — Reranker
- [ ] reranker.test.js: топ результат після rerank має вищий rerankScore
- [ ] reranker не падає якщо results.length < topN
- [ ] rate limiting для reranker API calls

### Фаза 5б — Dual Input UI
- [ ] два поля вводу в index.html
- [ ] keywords відображаються як теги з можливістю видалення
- [ ] кнопка "+ додати keyword" працює
- [ ] upload файлів приймає PDF, DOCX, TXT
- [ ] explanation відображається під кожним результатом

---

## 9. ADR ДОКУМЕНТИ (обов'язково написати)

```markdown
# ADR-001: Hybrid Search через SQLite FTS5

## Проблема
Pure cosine similarity погано матчить точні технічні терміни.

## Альтернативи
- pgvector + PostgreSQL full-text search
- Qdrant hybrid search
- SQLite FTS5 + existing embeddings

## Рішення
SQLite FTS5 — не міняємо стек, працює в існуючому db.js.

## Trade-offs
+ Нульова міграція інфраструктури
+ Працює офлайн
- Менш потужний ніж pgvector для великих обсягів (>1M документів)

## Коли переглянути
Якщо corpus > 100K документів або потрібен мультимовний пошук.
```

---

## 10. ЩО НЕ ВХОДИТЬ В v5 (але архітектура готова)

- Cohere Rerank API (замість self-hosted reranker)
- pgvector міграція для scale
- Multi-tenant (кілька користувачів з різними даними)
- API для зовнішніх інтеграцій
- Webhooks для автоматичних тригерів
- Збереження і перевикористання згенерованих profiles
