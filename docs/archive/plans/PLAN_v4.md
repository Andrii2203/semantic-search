# Semantic Search Engine — Production-Ready Plan v4.0

## 1. ЩО БУДУЄМО
Універсальний семантичний engine який:
- Підключається до будь-якого джерела через уніфікований інтерфейс
- Фільтрує дані через embeddings за значенням, не за ключовими словами
- Вибирає дію залежно від типу даних (коментар, cover letter, рефакторинг)
- Підтримує кілька профілів — різні задачі без зміни коду
- Показує результати в браузері — людина діє вручну

## 2. НАВІЩО
Версія 1.0 — знайти релевантні пости для коментування, збільшити присутність в інтернеті.
Версія 2.0 — знайти релевантні вакансії на Djinni та інших дошках.
Версія N — будь-яке джерело, будь-яка дія, через новий Source і новий Action.

## 3. КЛЮЧОВІ АРХІТЕКТУРНІ ІДЕЇ

### 3.1 Уніфікований IR (Intermediate Representation)
Кожне джерело повертає дані в єдиному форматі.
SearchEngine працює тільки з полем content.
Все специфічне — в metadata.

```javascript
{
  id: "abc123",          // хеш від URL або контенту
  content: "...",        // головний текст для embeddings
  type: "post",          // post / job / code_snippet / ui_component
  source: "hn",          // hn / reddit / devto / djinni / github
  metadata: {
    title: "...",
    url: "https://...",
    author: "...",
    language: "javascript",  // для code_snippet
    company: "...",           // для job
  }
}
```

Валідація IR об'єктів через Zod schema:
```javascript
const IRSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(["post", "job", "code_snippet", "ui_component"]),
  source: z.string().min(1),
  metadata: z.object({
    title: z.string().optional(),
    url: z.string().url().optional(),
    author: z.string().optional(),
  }).passthrough()
})
```

### 3.2 Action Dispatcher
Замість одного generator.js — система дій.
Коли item проходить фільтр, Dispatcher дивиться на type і вибирає Action.

```javascript
const actions = {
  "post":         GenerateComment,
  "job":          GenerateCoverLetter,
  "code_snippet": RefactorCode,
}

const action = actions[item.type]
const result = await action.run(item, activeProfile)
```

Додати нову дію = один новий файл Action. Нічого більше не міняється.

### 3.3 Мультипрофільність
Кілька профілів в config. Активний профіль визначає що шукаємо.

```javascript
// .env
ACTIVE_PROFILE=content

// config.js
PROFILES: {
  "job_hunter": "./profiles/job_hunter.json",
  "content":    "./profiles/content.json",
}
ACTIVE_PROFILE: process.env.ACTIVE_PROFILE || "content"
```

### 3.4 SearchEngine як ізольований модуль
SearchEngine не знає про sources, profiles, або actions.
Він отримує масив IR об'єктів і повертає відфільтровані.

```javascript
const results = await SearchEngine.findRelevant(
  dataBatch,      // масив IR об'єктів з будь-якого джерела
  activeProfile,  // вектор профілю
  threshold       // 0.65
)
```

## 4. СТЕК
- Runtime: Node.js (>=18.0.0)
- Веб сервер: Express
- База даних: SQLite (better-sqlite3)
- Embeddings: @xenova/transformers (all-MiniLM-L6-v2)
- LLM: Groq API (Llama) — безкоштовно
- Планувальник: node-cron
- Фронтенд: plain HTML + vanilla JS
- Валідація: Zod
- Тести: Jest
- Логування: pino (JSON)
- Security: helmet, cors, express-rate-limit
- Config: dotenv

## 5. СТРУКТУРА ФАЙЛІВ
```
/semantic-search
  /src
    server.js              — Express сервер, роути, middleware
    scheduler.js           — cron job, запускає цикл
    search-engine.js       — ізольований SearchEngine модуль
    dispatcher.js          — Action Dispatcher
    db.js                  — всі операції з SQLite + міграції
    logger.js              — structured logging (pino)
    config.js              — env-based configuration
    validation.js          — Zod schemas для IR та API inputs
    retry.js               — retry with exponential backoff
    shutdown.js            — graceful shutdown handler
    /sources
      index.js             — реєстр sources, fetchAll()
      hn.js                — Hacker News
      reddit.js            — Reddit
      devto.js             — Dev.to
      djinni.js            — Djinni (версія 2.0)
    /actions
      index.js             — реєстр actions
      generate-comment.js  — для type: post
      generate-cover.js    — для type: job
      refactor-code.js     — для type: code_snippet (майбутнє)
    /profiles
      content.json         — вектор для пошуку постів
      job_hunter.json      — вектор для пошуку вакансій
  /public
    index.html             — інтерфейс
  /__tests__
    search-engine.test.js
    db.test.js
    dispatcher.test.js
    validation.test.js
    retry.test.js
    server.test.js
    /sources
      hn.test.js
  /data
    app.db                 — SQLite база (gitignored)
  .env.example             — шаблон конфігурації
  .env                     — (gitignored) реальні значення
  .eslintrc.json           — лінтинг правила
  .prettierrc              — форматування
  .gitignore
  Dockerfile
  docker-compose.yml
  jest.config.js
  package.json
  README.md
```

## 6. БАЗА ДАНИХ

### таблиця items
| поле | тип | опис |
|------|-----|-------|
| id | TEXT PRIMARY KEY | хеш від контенту |
| content | TEXT NOT NULL | головний текст для embeddings |
| type | TEXT NOT NULL | post / job / code_snippet |
| source | TEXT NOT NULL | hn / reddit / devto / djinni |
| metadata | TEXT | JSON з title, url, author та іншим |
| score | REAL | cosine similarity з профілем |
| response | TEXT | згенерована відповідь від Action |
| status | TEXT NOT NULL DEFAULT 'new' | new / approved / skipped / pending |
| fingerprint | TEXT UNIQUE NOT NULL | хеш для дедуплікації |
| created_at | TEXT NOT NULL DEFAULT (datetime('now')) | дата додавання |

### таблиця migrations
| поле | тип | опис |
|------|-----|-------|
| id | INTEGER PRIMARY KEY | auto increment |
| name | TEXT UNIQUE NOT NULL | ім'я міграції |
| applied_at | TEXT NOT NULL | коли застосована |

## 7. ERROR HANDLING STRATEGY

### Error Types
```javascript
class AppError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

// Коди помилок
const ErrorCodes = {
  SOURCE_FETCH_FAILED: 'SOURCE_FETCH_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  LLM_API_ERROR: 'LLM_API_ERROR',
  DB_ERROR: 'DB_ERROR',
  CONFIG_INVALID: 'CONFIG_INVALID',
}
```

### Retry Policy
| Операція | Max Retries | Base Delay | Backoff |
|----------|------------|------------|---------|
| Source fetch | 3 | 1s | exponential |
| Groq API call | 3 | 2s | exponential |
| DB write | 2 | 500ms | exponential |

### Failure Isolation
- Один source впав → лог + решта працює
- Groq API впав після retries → item зберігається зі status: "pending"
- SQLite впала → лог + цикл зупиняється + алерт
- Невалідний IR → item пропускається, лог з деталями

---

## 8. ПОРЯДОК ПОБУДОВИ ТА ACCEPTANCE CRITERIA

### Фаза 0 — Інфраструктура проєкту

**Що робимо:**
1. `package.json` з `engines: { node: ">=18.0.0" }`, scripts: start, dev, test, lint, format
2. `.env.example` з усіма змінними (PORT, GROQ_API_KEY, ACTIVE_PROFILE, DB_PATH та ін.)
3. `config.js` — читає з `process.env`, fallback на defaults
4. `.eslintrc.json` + `.prettierrc`
5. `jest.config.js`
6. `.gitignore` — data/, .env, node_modules/, *.db
7. `README.md` з секціями: Overview, Install, Configuration, Run, Test, Architecture, API

**✅ Acceptance Criteria:**
- [ ] `npm install` завершується без помилок і warnings
- [ ] `npm run lint` працює і повертає 0 помилок
- [ ] `npm run test` запускається (може бути 0 тестів, але не крашиться)
- [ ] `npm run dev` запускає сервер (навіть порожній Express)
- [ ] `.env.example` містить всі змінні з описами
- [ ] `README.md` містить секції Install, Configuration, Run, Test
- [ ] `config.js` кидає зрозумілу помилку якщо обов'язкова env variable відсутня

---

### Фаза 1 — Data Layer (DB + Logger + Validation)

**Що робимо:**
1. `logger.js` — pino з JSON output + рівнями info/warn/error
2. `validation.js` — Zod schemas для IR та API inputs
3. `db.js` — ініціалізація SQLite, таблиця items, міграції, CRUD операції
4. `retry.js` — utility з exponential backoff

**✅ Acceptance Criteria:**
- [ ] `npm run test` — 100% тестів проходить для db, validation, retry
- [ ] `db.test.js` — перевіряє: створення таблиці, insert, select, дедуплікація по fingerprint, міграція
- [ ] `validation.test.js` — перевіряє: валідний IR проходить, невалідний — кидає помилку з деталями
- [ ] `retry.test.js` — перевіряє: retry after failure, max retries respected, exponential delay
- [ ] Logger пише JSON в stdout: `{ "level": "info", "msg": "...", "time": "..." }`
- [ ] DB автоматично створюється при першому запуску

---

### Фаза 2 — Sources

**Що робимо:**
1. `sources/hn.js` — fetch Hacker News, повертає масив валідних IR об'єктів
2. `sources/index.js` — реєстр sources, `fetchAll()` з ізольованим error handling
3. Retry для кожного source окремо

**✅ Acceptance Criteria:**
- [ ] `hn.test.js` — mock HTTP, перевіряє: повертає масив IR, кожен має id/content/type/source/metadata
- [ ] Невалідна відповідь від API → повертає порожній масив + warning в лозі, не кидає помилку
- [ ] `fetchAll()` — один source впав → решта працює, повертає часткові результати
- [ ] Кожен IR об'єкт проходить Zod валідацію
- [ ] `npm run lint` — 0 помилок

---

### Фаза 3 — SearchEngine

**Що робимо:**
1. `search-engine.js` — generateEmbedding, cosineSimilarity, findRelevant
2. `profiles/content.json` — побудувати вектор профілю один раз

**✅ Acceptance Criteria:**
- [ ] `search-engine.test.js` — перевіряє:
  - `cosineSimilarity([1,0], [1,0])` === 1.0
  - `cosineSimilarity([1,0], [0,1])` === 0.0
  - `findRelevant` повертає тільки items з score > threshold
  - `findRelevant` з порожнім масивом → повертає порожній масив
  - `findRelevant` з threshold = 0 → повертає всі items
- [ ] SearchEngine не імпортує жодного модуля з проєкту (ізольований)
- [ ] Модуль працює з будь-якими IR об'єктами незалежно від source/type

---

### Фаза 4 — Action Dispatcher

**Що робимо:**
1. `actions/generate-comment.js` — Groq API, генерує коментар
2. `actions/index.js` — реєстр actions
3. `dispatcher.js` — вибирає action по type, rate limiting для Groq calls

**✅ Acceptance Criteria:**
- [ ] `dispatcher.test.js` — з mock Groq API перевіряє:
  - type: "post" → викликає GenerateComment
  - type: "job" → викликає GenerateCoverLetter
  - невідомий type → повертає null + warning, не кидає помилку
  - Groq API failed → retry 3 рази, потім item отримує status: "pending"
- [ ] Rate limiter обмежує Groq calls до N/хв (конфігурується)
- [ ] Actions не знають один про одного

---

### Фаза 5 — Server та UI

**Що робимо:**
1. `server.js` — Express + middleware (helmet, cors, rate-limit, pino-http)
2. API routes + error handling middleware
3. `shutdown.js` — graceful shutdown
4. `index.html` — інтерфейс

**✅ Acceptance Criteria:**
- [ ] `server.test.js` (supertest):
  - `GET /api/health` → `{ status: "ok", uptime: N, db: "connected" }`
  - `GET /api/items?status=new` → 200 + масив items
  - `POST /api/items/:id/approve` → 200, status змінюється в DB
  - `POST /api/items/invalid-id/approve` → 404, JSON error з кодом
  - Invalid route → 404 JSON error
- [ ] Security headers присутні (перевірити через curl -I)
- [ ] CORS дозволяє тільки сконфігурований origin
- [ ] Graceful shutdown закриває DB connection і HTTP server
- [ ] `npm run dev` — localhost:3000 відкривається, UI показує items
- [ ] Кнопка "Approve" копіює response в буфер

---

### Фаза 6 — Scheduler та Full Pipeline

**Що робимо:**
1. `scheduler.js` — cron job, повний цикл: fetch → validate → search → dispatch → save
2. Integration test: source → search → dispatch → DB

**✅ Acceptance Criteria:**
- [ ] `scheduler.test.js` — mock all externals, перевіряє:
  - Повний цикл від fetch до save працює
  - Часткова відмова (1 source) → решта доходить до DB
  - Дублікати не додаються повторно
- [ ] `npm run test` — ВСІ тести (unit + integration) проходять
- [ ] Після запуску scheduler, нові items з'являються в DB і UI
- [ ] Логи показують: CYCLE START, fetch counts, filter count, dispatch count, CYCLE END, duration

---

### Фаза 7 — DevOps та CI

**Що робимо:**
1. `Dockerfile` — multi-stage build (builder → production)
2. `docker-compose.yml` — app + volume для data/
3. `.github/workflows/ci.yml` — lint + test on push

**✅ Acceptance Criteria:**
- [ ] `docker build .` — білд завершується без помилок
- [ ] `docker-compose up` — app працює на порту 3000
- [ ] Container розмір < 200MB (multi-stage build)
- [ ] CI pipeline запускає lint + test і зеленіє
- [ ] Prod `NODE_ENV=production` — debug logs вимкнені, performance mode ввімкнений
- [ ] `npm run test -- --coverage` показує > 80% покриття

---

### Фаза 8 — Розширення джерел (версія 2.0+)

**Що робимо:**
1. `sources/reddit.js` + `sources/devto.js`
2. `profiles/job_hunter.json` + `sources/djinni.js`
3. `actions/generate-cover.js`

**✅ Acceptance Criteria:**
- [ ] Кожен новий source має тест з mock HTTP
- [ ] `fetchAll()` працює з 3+ джерелами одночасно
- [ ] Зміна `ACTIVE_PROFILE=job_hunter` → система шукає вакансії
- [ ] Cover letter генерується для type: "job"
- [ ] Всі тести (нові + старі) проходять
- [ ] `npm run lint` — 0 помилок

---

## 9. PRODUCTION-READY CHECKLIST

| # | Item | Фаза |
|---|------|------|
| 1 | Environment-based config (.env + dotenv) | 0 |
| 2 | Linting + formatting (ESLint + Prettier) | 0 |
| 3 | README з Install/Run/Test | 0 |
| 4 | Structured logging (pino, JSON) | 1 |
| 5 | Input validation (Zod schemas) | 1 |
| 6 | DB migrations system | 1 |
| 7 | Retry with exponential backoff | 1 |
| 8 | Automated unit tests (Jest) | 1-6 |
| 9 | Source failure isolation | 2 |
| 10 | Rate limiting for LLM calls | 4 |
| 11 | Error codes + AppError class | 4 |
| 12 | Security headers (helmet) | 5 |
| 13 | CORS configuration | 5 |
| 14 | API rate limiting | 5 |
| 15 | Health check endpoint | 5 |
| 16 | Graceful shutdown | 5 |
| 17 | Integration tests | 6 |
| 18 | Dockerfile (multi-stage) | 7 |
| 19 | CI pipeline | 7 |
| 20 | Test coverage > 80% | 7 |

## 10. ЩО НЕ ВХОДИТЬ В v1.0 (але архітектура готова)
- Авторизація і мульти-юзер
- Хмарний деплой (AWS/GCP/Railway)
- Платіжна система
- Мобільний інтерфейс
- Підключення до Iceberg OS як handler
- WebSocket для real-time updates
