# Universal Matching Engine: PLAN v7 (Execution Plan)

## Контекст

Тип: Персональний інструмент, побудований як продукт.  
Мета: Навчитися будувати production-grade систему одному.  
Підхід: Фазова доставка. Кожна фаза = working system + тести + Docker.  
Якість: Без компромісів. Як для команди з 10 людей, але робить 1.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      REACT UI (Gmail-inspired)                      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Header: "Universal Matching Engine"          [Sun/Moon]     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  STATE A: Нічого не вибрано (list займає весь простір)            │
│  ┌────┬────────────────────────────────────────────────────────┐   │
│  │[i] │  Post title                   HN  ·  2h ago           │   │
│  │[s] │  author · score 847                                    │   │
│  │[d] │ ─────────────────────────────────────────────────────  │   │
│  │[k] │  Post title                   Reddit · 5h ago         │   │
│  │────│  author · score 312                                    │   │
│  │[/] │ ─────────────────────────────────────────────────────  │   │
│  │────│  Post title                   Djinni · 1d ago         │   │
│  │[~] │  author                                                │   │
│  └────┴────────────────────────────────────────────────────────┘   │
│   icon                                                              │
│   only                                                              │
│                                                                     │
│  STATE B: Item вибрано (reading pane займає весь простір)         │
│  ┌────┬────────────────────────────────────────────────────────┐   │
│  │[i] │  <- Back                                               │   │
│  │[s] │                                                        │   │
│  │[d] │  Post Title (full)                                     │   │
│  │[k] │  HN · author · score 847 · 2h ago                     │   │
│  │────│  ─────────────────────────────────────────────────     │   │
│  │[/] │  Full content of the post...                           │   │
│  │────│  ...                                                   │   │
│  │[~] │  ─────────────────────────────────────────────────     │   │
│  │    │  [AI Response box if generated]                        │   │
│  └────┴────────────────────────────────────────────────────────┘   │
│         [Generate][Copy] · [Approve][Skip][Star][Delete][Why?]     │
│                                                                     │
│  Sidebar icons: [i]=Inbox [s]=Starred [d]=Done [k]=Skipped        │
│                 [/]=Search [~]=Sync  (collapsible, text on hover)  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Footer: DB ok · HN ok · Reddit ok · Djinni warn · 42s      │  │
│  └──────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                          EXPRESS API                                │
│  /api/items · /api/search · /api/profiles · /api/health            │
│  /api/auth  · /api/sync   · /api/settings · /api/client-error      │
├─────────────────────────────────────────────────────────────────────┤
│  Startup     │ Scheduler      │ Search Engine    │ Health Checker   │
│  Diagnostics │ (cron + manual)│ (BM25 + cosine)  │ (modules status) │
├─────────────────────────────────────────────────────────────────────┤
│                       SQLite (WAL mode)                             │
│  users │ items │ chunks │ chunks_fts │ profiles │ user_matches │ settings │ migrations │
└─────────────────────────────────────────────────────────────────────┘
```

UI поведінка:
- Sidebar завжди видимий, за замовчуванням, тільки SVG іконки. Розгортається при hover/toggle → показує текст + лічильники.
- Без вибраного item: list займає весь простір праворуч від sidebar.
- Після кліку на item: reading pane відкривається на повний простір. List прихований. "← Back" повертає.
- Дві чисті теми: dark (за замовчуванням) та light. Перемикач у header. Без glassmorphism, без динамічних ефектів.
- Лише SVG іконки: жодних текстових емоджі у коді.

*(Примітка: Символи у схемі: лише мнемоніки для читабельності. В реалізації, виключно чисті SVG-іконки.)*

---

## Ключові рішення (після критичного огляду)

| Рішення | Було | Стало | Чому |
|---------|------|-------|------|
| Gmail UI | Точна копія | Gmail-inspired MVP layout | Точна копія = 3 місяці, inspired = 1 тиждень |
| Settings в UI | Всі 40+ | Essential (8-10) в UI, решта Advanced | Менше багів, менше поверхня для помилок |
| Config source | DB → .env → defaults | `.env` bootstrap → `settings` table (єдине джерело) | Одне джерело правди |
| AI prompts | Повне редагування | System prompt readonly + editable instructions | Захист від prompt injection |
| Settings table | Key-value (TEXT) або один JSON рядок | Нормалізована таблиця (key, value, type) | Легкі часткові оновлення, типізація, прості міграції окремих полів |
| Startup | Немає | Startup diagnostics | Критично, знати чи система ready |
| PDF processing | Worker thread | Синхронний парсинг + заміри часу (Worker thread лише за потреби) | Уникнення передчасної складності (message passing / shared memory), якщо блокування < 1 хв |
| Temp cleanup | Manual Clear | Auto-cleanup + `VACUUM` | Звільнення місця на диску та запобігання фрагментації |
| API key | Visible в UI | Set-only (можна замінити, не можна побачити) | Security |
| Error handling | Тільки backend | Error Boundary + business events | Production grade |
| Security Model | Один спільний пароль в `.env` (INTERNET_MODE_PASSWORD) | Per-user реєстрація (email + bcrypt) + httpOnly Cookie session з user_id | Кожен юзер має свій акаунт, свої дані, не бачить чужих |
| Files Mode access | Публічний, без реєстрації | Під логіном, як Internet Mode (рішення 2026-06-12). Файли мульти-тенант: `user_id` + `collection_id='files'`, юзер бачить лише свої | Зараз пріоритет, цілісна функціональність системи, не онбординг. Анонімний trial (optionalAuth + retail-обмеження) відкладено у Phase 5 backlog |
| Multi-user isolation | Один shared DB, всі бачать одні й ті ж дані | Дедуплікований корпус + `user_matches`. Публічний контент (`internet`) зберігається й ембедиться 1 раз; приватний (`files`) ізольований по `user_id` | Уникає вибуху O(users × items): ембединг не залежить від кількості юзерів. Персоналізація, дешевий шар поверх спільного корпусу. Див. блок «Архітектурне уточнення (v7.1)» |
| State Management | N/A | Zustand + TanStack Query | Надійний кеш та UI стейт |
| UI Icons | Текстові емоджі | Лише чисті SVG-іконки | Rich aesthetics, консистентність, професійний вигляд без «дешевих» емоджі |
| Search ranking | Weighted sum (0.4×BM25 + 0.6×cosine) | RRF (Reciprocal Rank Fusion) | Стабільніше об'єднання результатів незалежно від масштабу scores |
| Result diversity | Top-N за score (може бути 5 схожих постів) | MMR (Maximal Marginal Relevance) | Баланс relevance і різноманітності, без дублювання |
| AI features | Або завжди ON, або завжди OFF | Per-function toggles з поясненням | Людина вирішує per-action, бачить що це робить і скільки коштує |
| Query expansion | Пошук за точним текстом запиту | HyDE (опційно, платно) | LLM генерує hypothetical doc → точніший semantic match |
| Chunk quality | Plain text chunks | Contextual Chunking (опційно, платно) | LLM додає контекст до кожного chunk → +49% retrieval accuracy |
| Deduplication | Тільки за URL hash | Content-hash dedup (per-collection) + semantic near-dedup (cosine > 0.95) | `internet` → `hash(content)`, спільний для всіх. `files` → `hash(userId+content)`, ізольований. Один і той самий пост з HN/Reddit не дублюється і ембедиться раз |
| Personalization layer | Статус (`star`/`approve`/`skip`) у `items.status` | Таблиця `user_matches(user_id, item_id, score, status)` | «Релевантно для тебе» і твої дії, особисті, а контент спільний. Обслуговує і feedback loop, і дедуп одночасно |
| Pre-filter | Вставляємо все що прийшло | Евристичний pre-filter перед embedding | Текст < 50 символів, title === content, очевидний SEO-сміттєвий шаблон → пропускаємо без LLM/embed |
| Importance at ingest | Важливість не визначається | LLM класифікує high/normal/junk при надходженні (опційно, платно) | ItemRow показує мітку. Юзер бачить "важливе" зверху без ручного перегляду всього |

---

## Архітектурне уточнення (v7.1): Дедуплікований корпус + `user_matches`

> Чому це з'явилось. Фаза 1 заклала content-hash dedup (`hash(source+content)`), але Фаза 2 заради «повної ізоляції» переписала `fingerprint()` на `hash(userId+content)`. Наслідок, той самий публічний пост зберігається й ембедиться окремо для кожного юзера → витрати ростуть як O(users × items). На безкоштовному/слабкому хості (Oracle Free, render) це впирається в CPU/RAM і цикл не встигає за кроном. Це уточнення примиряє Фазу 1, Фазу 2 і near-dedup із Фази 2.5.

### Принцип: контент глобальний, персоналізація, особиста

```
КОРПУС (спільний, ембедиться 1 раз)        ПЕРСОНАЛІЗАЦІЯ (дешевий шар)
┌──────────────┬───────────────┐           ┌─────────┬─────────┬───────┬────────┐
│ items        │ chunks+vectors│◄──────────│ user_id │ item_id │ score │ status │
└──────────────┴───────────────┘           └─────────┴─────────┴───────┴────────┘
   fingerprint per-collection                          user_matches
```

- `collection_id = 'internet'` (HN/Reddit/Djinni, RSS, web-search, публічне):
  `fingerprint = sha256(content)` без `user_id`. Зберігається й ембедиться один раз. Перетин джерел між юзерами → дедуп спрацьовує.
- `collection_id = 'files'` (завантажені документи, приватне):
  `fingerprint = sha256(userId + content)`, фільтр по `user_id` лишається. Жодного спільного доступу.
- `user_matches` тримає зв'язок «юзер ↔ релевантний item» + персональний `score` + персональний `status` (`new`/`starred`/`approved`/`skipped`). Те, що A поставив зірочку, не впливає на B.

### Що це дає
- Ембединг перестає залежати від кількості юзерів (×N → ×1 для спільного контенту).
- Пошук обслуговується з готових векторів: якщо контент уже в корпусі, наступний юзер не ембедить його заново, лише свій запит (~1 вектор).
- Feedback loop (Фаза 2.5) і near-dedup (Фаза 2.5) стають сумісними: рухомий профіль = дешевий cosine по кешованих векторах.

### Міграція (реалізується в Phase 2.5/2.6, до переходу на динамічні джерела)
1. `CREATE TABLE user_matches (user_id, item_id, score, status, created_at, PRIMARY KEY(user_id, item_id))`.
2. `fingerprint(item)` розгалужується по `collectionId` (internet → без userId, files → з userId).
3. Scheduler: ембедить унікальний контент один раз → пише в `items`/`chunks`; для кожного юзера лише cosine vs профіль → рядок у `user_matches`.
4. Бекфіл: перенести наявні `items.status` у `user_matches`, схлопнути дублі internet-контенту по `hash(content)`.
5. `getItemsPage`/`getItemCount`/статус-роути читають/пишуть через `user_matches` для internet-колекції.

---

## Current System State Audit (Від чого ми відштовхуємось)

Перед початком Phase 1, ось детальний опис того, що вже є в коді, і що бракує або зламано:

### 1. Backend & Pipeline
*   Є: `src/scheduler.js` (збирає дані з HN, Reddit, Djinni), `src/search-engine.js` (робить BM25 + cosine similarity), `src/db.js` (повний CRUD для `items` та `chunks`).
*   Зламано/Вимкнено: `scheduler.start()` закоментовано в `server.js`.
*   Бракує (The Gap): Scheduler зберігає дані тільки в таблицю `items`. Він не створює chunks і не генерує векторні ембедінги. Оскільки новий пошук (з v5/v6) шукає по таблиці `chunks`, він не бачить жодних нових постів з інтернету.
*   Профіль: Scheduler читає хардкоджений JSON (`src/profiles/content.json` або `job_hunter.json`). Немає читання з БД.

### 2. Frontend UIs
*   Legacy UI (`public/`): Вміє показувати `items`, має кнопки Approve/Skip/Generate Comment. Бракує: Не вміє робити пошук по `chunks`, не має доступу до налаштувань, використовує старі API роути.
*   React UI (`client/src/`): Вміє робити пошук (`/api/search`), має базовий UI для результатів, вміє завантажувати файли. Бракує: Не вміє показувати inbox (новини з інтернету), не має кнопок Generate/Approve/Skip, не має налаштувань, немає Health Footer. Зараз це лише "пошукова форма", а не Gmail-подібний клієнт.

### 3. Database (`src/db.js`)
*   Є: Схема з міграціями, FTS5 таблиці для повнотекстового пошуку, збереження векторів у BLOB.
*   Бракує: Поля `collection_id` в таблиці `items`. Зараз всі дані (і пости з HN, і завантажені резюме) лежать разом. Немає ізоляції даних (Internet vs Files).
*   Бракує: Таблиці `settings` для збереження налаштувань користувача.

### 4. Налаштування (Configuration)
*   Є: `src/config.js`, який читає 40+ значень з `.env` файлу.
*   Бракує: Можливості змінювати налаштування без перезапуску сервера. Немає API роутів для читання/збереження налаштувань.

### 5. AI & Prompts
*   Є: Інтеграція з Groq API (`src/groq-client.js`), екшени для генерації коментарів (`src/actions/generate-comment.js`), reranker (`src/reranker.js`), explainer (`src/explainer.js`).
*   Бракує: Всі промпти захардкоджені в коді. Їх неможливо змінити через UI.

### 6. Infrastructure & Observability
*   Є: Логування через Pino (`src/logger.js`).
*   Бракує: Немає `startup.js` (перевірка чи все ок при старті). Немає `health-checker.js` для моніторингу статусу (HN працює? DB жива?). Всі помилки летять в термінал.

---

## Phase 1: Fix the Gap (3 дні)

### Scope
Зробити систему працюючою end-to-end: scheduler → chunks → search → inbox в React UI.

### Deliverables

#### Backend
- [NEW] `src/startup.js`: startup diagnostics
  - Перевіряє: DB connection, embedding model load, Groq API reachability, FTS5 integrity
  - Пробує згенерувати тестовий embedding (384-dim vector check)
  - Результат → `GET /api/health` (basic)
  - Якщо embedding fail → стартуємо в degraded mode (без semantic search)
  - Якщо DB fail → не стартуємо

- [MODIFY] `src/scheduler.js`: після insertItems → chunk + embed + save chunks
  - Scheduler uses active profile from `profiles` table (not JSON file)
  - Items saved with `collection_id = 'internet'`
  - Pre-filter перед embedding (детермінований, без LLM):
    - `content.length < 50` → skip (link-пост без тексту)
    - `item.title === item.content` → skip (SEO-сміття або дублювання)
    - Відфільтровані items логуються з причиною, але не зберігаються
  - Content-hash dedup: `sha256(source + ':' + content)` зберігається як `fingerprint`, якщо такий hash вже є для цього `user_id`, INSERT пропускається (`INSERT OR IGNORE`)

- [MODIFY] `src/db.js`: migration: add `collection_id` to `items`
  - Backfill existing items: `collection_id = 'internet'`
  - Add index on `collection_id`

- [NEW] `src/routes/health.js`: basic health endpoint
  - `GET /api/health` → `{ status, modules: { db, embedding, groq, scheduler } }`

- [MODIFY] `src/server.js`
  - Call `startup.js` before listening
  - Log startup diagnostics results
  - Enable scheduler (read profile from DB)
  - Mount health routes

#### Frontend
- [MODIFY] React UI: показати items з БД
  - Простий inbox list (no Gmail layout yet)
  - `GET /api/items` → render list
  - Click item → show detail
  - Search input → `POST /api/search` → show results
  - Health status footer (реалізується за допомогою стилізованих SVG-іконок)

#### Docker
- Verify `docker-compose up` → startup diagnostics → all green
- Hot-reload працює для backend і frontend

### Definition of Done: Phase 1

```
- [ ] `docker-compose up` → startup diagnostics pass
- [ ] Startup log shows: DB green, Embedding green, Groq green/warning, FTS5 green
- [ ] If embedding model fails → server starts, health shows "degraded"
- [ ] Scheduler loads profile from DB (not JSON file)
- [ ] Scheduler run → fetches items → creates chunks → saves vectors
- [ ] `GET /api/items` returns items with collection_id
- [ ] `POST /api/search` returns results filtered by collection_id
- [ ] React UI shows inbox list from /api/items
- [ ] React UI shows search results from /api/search
- [ ] React UI shows health footer with SVG status icons (no raw emojis)
- [ ] `GET /api/health` returns correct status for all modules
- [ ] All existing tests pass (`npm test`)
- [ ] New tests: startup.js (all paths), scheduler chunking, health endpoint
- [ ] Test coverage ≥ 80%
```

### Tests: Phase 1
```
tests/startup.test.js
  ✓ checkDatabase: success case
  ✓ checkDatabase: failure case (DB not initialized)
  ✓ checkEmbeddingModel: success case (384-dim vector)
  ✓ checkEmbeddingModel: failure case (model not found)
  ✓ checkGroqAPI: no key → degraded
  ✓ checkGroqAPI: key present → ok
  ✓ runStartupChecks: all pass → healthy
  ✓ runStartupChecks: embedding fails → degraded (not crash)
  ✓ runStartupChecks: DB fails → critical (don't start)

tests/scheduler-chunking.test.js
  ✓ runCycle creates chunks for each item
  ✓ runCycle generates embeddings for chunks
  ✓ runCycle uses profile from DB (not JSON)
  ✓ runCycle sets collection_id = 'internet'

tests/routes/health.test.js
  ✓ GET /api/health returns all module statuses
  ✓ GET /api/health reflects degraded state
```

### Rollback: Phase 1
| Якщо | Дія | Час |
|------|-----|-----|
| collection_id migration breaks | `ALTER TABLE items DROP COLUMN collection_id` | 5 хв |
| Scheduler chunking fails | Revert scheduler.js, comment out chunking | 10 хв |
| Startup diagnostics blocks boot | Remove startup.js call from server.js | 2 хв |

---

## Phase 2: Core UX: Gmail Layout (1 тиждень)

### Scope
Gmail-inspired layout: sidebar + list + reading pane. Core actions: Generate, Copy, Approve, Skip.

### Deliverables

#### Frontend (повний редизайн)
- Layout: Adaptive Gmail-inspired
  - Sidebar: Collapsible: default показує тільки SVG іконки (icon-only mode); hover або toggle → розгортається з текстом та лічильниками. Елементи: Inbox, Starred, Done, Skipped, Search, System status dot, Sync button.
  - List (default: no item selected): займає весь доступний простір після sidebar. Показує Score, Source, Author, Time у кожному рядку. Reading pane прихований.
  - Reading pane (item selected): відкривається у повний екран поверх списку (або витісняє його). Кнопка "← Back" повертає до списку. Sidebar залишається видимим (icon-only).
  - Item delete: кожен пост можна повністю видалити з DB → `DELETE /api/items/:id`.
- ItemRow показує:
  - Заголовок (truncated)
  - Source (HN / Reddit / Djinni) + Score (⬆ 847) + Author
  - Відносний час (2h ago)
- Actions (в reading pane):
  - [Generate Comment] → `POST /api/items/:id/generate` → show AI response
  - [Copy] → clipboard
  - [Regenerate] → re-call generate
  - [Approve] → `POST /api/items/:id/status` body: `{status: 'approved'}`
  - [Skip] → same, `{status: 'skipped'}`
  - [Star] → `{status: 'starred'}`
  - [Delete] → `DELETE /api/items/:id` → item зникає назавжди
  - [Why this match?] → `POST /api/search/explain`
- Sync button у Sidebar:
  - SVG іконка refresh у нижній частині sidebar
  - `POST /api/sync` → запускає scheduler cycle вручну → TanStack Query invalidateQueries після успіху
- Search input (persistent profile):
  - Textarea в top bar або як "Compose" modal
  - [Save] → `POST /api/profiles` (saves to DB)
  - Показує поточний active profile
- State Management Strategy:
  - TanStack Query (React Query): для надійного кешування API-запитів (список items, результати пошуку, статуси).
  - Zustand: для легковагового локального стану UI (відкритий/закритий sidebar, активний item, mode switch).
- Security & Auth (Per-user Registration):
  - Internet Mode і Files Mode вимагають реєстрації (оновлено 2026-06-12; анонімний trial для Files Mode, Phase 5 backlog).
  - Реєстрація: `POST /api/auth/register` приймає `{ email, password }` → bcrypt hash (rounds=12) → зберігає у таблиці `users` → повертає session cookie.
  - Вхід: `POST /api/auth/login` приймає `{ email, password }` → перевіряє bcrypt проти `users` → повертає session cookie.
  - Session token: HMAC-підписаний payload `base64url({userId, iat}).sig`. Stateless, не потребує sessions таблиці.
  - `requireAuth` middleware: зчитує token → декодує `userId` → встановлює `req.userId` → всі DB-запити фільтруються по `user_id`.
  - Lock Screen overlay: при `401` або першому відкритті UI показує модальне вікно з двома режимами: Login / Register (toggle між ними). SVG іконка замка, email + password поля, без glassmorphism.
  - Вихід: `POST /api/auth/logout` → видаляє cookie. `GET /api/auth/status` → `{ authenticated, user: { id, email } }`.
  - Публічні роути (без auth): `/api/auth/*`, `/api/health`, `/api/client-error`. Решта (включно з `/api/upload` та `/api/search`), під логіном.
- UI Icons System:
  - Жодних сирих текстових емоджі (emoji) в коді та елементах інтерфейсу. Будь-які іконки (статуси здоров'я, інбокс, кнопки дій, замок тощо) реалізуються виключно через чисті стилізовані SVG-іконки для створення консистентного та rich-дизайну.
- Error Boundary:
  - Global ErrorBoundary component
  - Friendly message + Reload button
  - Reports to `POST /api/client-error`
- Pagination:
  - Cursor-based: `GET /api/items?cursor=...&limit=50`
  - Load more button або infinite scroll

#### Backend
- [NEW] `DELETE /api/items/:id`: повне видалення item + його chunks з DB
- [NEW] `src/middleware/auth.js`: Session-based Cookie Middleware (per-user)
  - `requireAuth`: зчитує HMAC-підписаний token з cookie → декодує `{ userId, iat }` → встановлює `req.userId`. Якщо немає або невалідний → 401.
  - Публічні префікси (без перевірки): `/api/auth`, `/api/health`, `/api/client-error`.
  - Захищені роути (вимагають `req.userId`): `/api/items`, `/api/profiles`, `/api/settings`, `/api/sync`, `/api/upload`, `/api/search`.
- [MODIFY] `src/routes/upload.js`: мульти-тенант для файлів (рішення 2026-06-12):
  - Кожен завантажений item зберігається з `userId: req.userId` та `collectionId: 'files'`.
  - Пошук по Files Mode фільтрується по `user_id` → юзер A не бачить файли юзера B.
- [NEW/MODIFY] `src/routes/auth.js`, User Registration & Login
  - `POST /api/auth/register`: `{ email, password }` → bcryptjs hash → `db.createUser()` → session cookie → `201 { user: { id, email } }`. Якщо email вже існує → 409 Conflict.
  - `POST /api/auth/login`: `{ email, password }` → `db.findUserByEmail()` → `bcrypt.compare()` → session cookie → `200 { user: { id, email } }`. Невірні дані → 401.
  - `POST /api/auth/logout`: очищує cookie → 200.
  - `GET /api/auth/status`: повертає `{ authenticated: bool, user: { id, email } | null }`.
- [MODIFY] `src/db.js`: User CRUD + multi-user isolation
  - Migration 008: `CREATE TABLE users (id TEXT PK, email TEXT UNIQUE, password_hash TEXT, created_at TEXT)`.
  - Migration 009: `ALTER TABLE items ADD COLUMN user_id TEXT REFERENCES users(id)` + index.
  - Migration 010: `ALTER TABLE profiles ADD COLUMN user_id TEXT REFERENCES users(id)` + index.
  - `fingerprint()` розгалужується по `collection_id` (див. «Архітектурне уточнення v7.1»):
    - `internet` (публічне) → `hash(source + type + content)` без userId, пост зберігається й ембедиться один раз для всіх.
    - `files` (приватне) → `hash(userId + source + type + content)`, повна ізоляція.
  - ⚠️ Поточна реалізація (Phase 2) включає userId завжди, це тимчасово, перемикається на per-collection у Phase 2.5/2.6 разом із `user_matches`.
  - `createUser({ email, passwordHash })`, `findUserByEmail(email)`, `findUserById(id)`, `getAllUsers()`.
  - Всі item-функції (`insertItem`, `getItemsPage`, `getItemCount`, `getItemById`, `updateItemStatus`, etc.) приймають `userId` і фільтрують по ньому.
  - `chunksSearch()` фільтрує по `user_id` через JOIN з `items`.
- [MODIFY] `src/scheduler.js`: Fetch once, insert for each user
  - Після fetch: `db.getAllUsers()` → для кожного юзера `insertItemsBatch(items.map(i => ({...i, userId: user.id })))`.
  - Якщо юзерів 0 → вставляє з `userId = null` (fallback для dev/bootstrap).
  - ⚠️ ТЕХБОРГ (Phase 2): ембединг рахується per-user → O(users × items). Переробляється в Phase 2.5/2.6 на «ембедити унікальний контент 1 раз → cosine vs кожен профіль → `user_matches`». Див. «Архітектурне уточнення v7.1».
- [MODIFY] `src/routes/items.js`: всі DB-виклики передають `userId: req.userId`.
- [MODIFY] `src/routes/search.js`: передає `userId: req.userId` для Internet Mode searches.
- [MODIFY] `src/routes/items.js`: cursor pagination
- [NEW] `src/routes/client-error.js`, frontend error reporting
- [MODIFY] `src/routes/items.js`: star/unstar endpoint
- [MODIFY] API actions (Generate / Explain):
  - Кешування AI-відповідей. Після генерації коментаря чи пояснення, вони зберігаються в БД (`items.response` або `items.metadata.ai_explain`), щоб повторний клік не витрачав ліміти Groq API.

#### Docker
- React dev server hot-reload через docker-compose override
- Production build test: `docker-compose -f docker-compose.yml up`

### Definition of Done: Phase 2

```
- [ ] Sidebar collapsible: icon-only mode за замовчуванням, розгортається за кліком/hover
- [ ] Sidebar: Sync button → POST /api/sync → items оновлюються без перезавантаження сторінки
- [ ] List fills full width when no item selected (reading pane hidden)
- [ ] ItemRow показує: title, source, score (⬆ N), author, relative time
- [ ] Click item → reading pane відкривається у повний екран, "← Back" повертає до списку
- [ ] Generate Comment → AI response appears
- [ ] Copy → clipboard works
- [ ] Approve/Skip/Star → status updates, item moves to correct category
- [ ] Delete → item та його chunks видаляються з DB, зникає зі списку
- [ ] "Why this match?" → explanation appears
- [ ] Search input → saves profile to DB
- [ ] Scheduler uses saved profile
- [ ] Pagination works (50 items per page, Load more)
- [ ] Error Boundary catches React errors → friendly UI
- [ ] Client errors reported to backend
- [ ] UI uses strictly custom SVG icons (no text emojis used in client code)
- [ ] Two clean themes (dark / light), no glassmorphism, no living design effects
- [ ] POST /api/auth/register → новий юзер + session cookie (201)
- [ ] POST /api/auth/register з існуючим email → 409 Conflict
- [ ] POST /api/auth/login з правильними даними → session cookie (200)
- [ ] POST /api/auth/login з невірними даними → 401
- [ ] GET /api/items без авторизації → 401
- [ ] GET /api/items з валідним cookie → тільки items цього юзера (ізоляція)
- [ ] Юзер A не бачить items юзера B
- [ ] Lock Screen показує Login / Register toggle
- [ ] Files Mode (upload, search): під логіном; завантажені файли мають user_id + collection_id='files'
- [ ] Файли мульти-тенант: юзер A не бачить і не знаходить пошуком файли юзера B
- [ ] React UI handles 401 → shows Lock Screen overlay
- [ ] All tests pass, coverage ≥ 80%
```

### Tests: Phase 2
```
tests/middleware/auth.test.js
  ✓ POST /api/auth/register → 201 + cookie
  ✓ POST /api/auth/register duplicate email → 409
  ✓ POST /api/auth/login correct → 200 + cookie з user_id
  ✓ POST /api/auth/login wrong password → 401
  ✓ GET /api/items without session → 401
  ✓ GET /api/items with valid session → 200, тільки items цього юзера
  ✓ GET /api/items з session іншого юзера → 200, інші items (ізоляція)
  ✓ POST /api/upload без session → 401
  ✓ POST /api/upload з session → item зберігається з user_id юзера + collection_id='files'
  ✓ Файли юзера A не видні юзеру B (items list + search)
  ✓ POST /api/auth/logout → cookie cleared

tests/routes/items-pagination.test.js
  ✓ cursor pagination returns correct page
  ✓ empty cursor returns first page
  ✓ invalid cursor returns 400

tests/routes/client-error.test.js
  ✓ POST /api/client-error logs error
  ✓ POST /api/client-error with empty body → 400

E2E (manual, documented):
  ✓ Open UI → see inbox
  ✓ Click item → see detail
  ✓ Generate → Copy → Approve flow
  ✓ Search → results → Why?
  ✓ Open UI → Lock screen visible → Register з email → Inbox accessible
  ✓ Logout → Login з тими ж даними → бачить тільки свої items
  ✓ Два юзери зареєстровані → кожен бачить тільки своє
```

### Rollback: Phase 2
| Якщо | Дія | Час |
|------|-----|-----|
| React UI broken | Revert App.jsx, компоненти повертають попередній стан | 10 хв |
| Pagination breaks API | Revert to `limit/offset` (existing) | 10 хв |
| Delete endpoint corrupts data | Soft-delete (add `deleted_at` column) замість фізичного видалення | 15 хв |

---

## Phase 2.5: Profile, Search Quality & AI Toggle (3–4 дні)

### Scope
Чотири пов'язані речі:
1. Профіль: людина сама описує що їй цікаво, система зберігає і використовує.
2. Feedback Loop: система вчиться на основі взаємодій (star/approve/skip → автоматичне уточнення профілю).
3. Покращення пошуку: RRF замість зваженої суми, MMR для різноманітності. Безкоштовно.
4. AI Toggle: кнопка в UI яка вмикає/вимикає платний AI-функціонал (HyDE, contextual chunking, AI rerank). За замовчуванням, вимкнено.

### Чому окрема фаза
Замикання петлі між тим що людина хоче і тим що система шукає. Верифікація що гібридний пошук реально працює. Прозорість щодо витрат на AI. Система стає розумнішою з часом без ручного втручання.

### AI: окрема кнопка на кожну функцію

Немає одного master switch. Кожна платна функція має власну кнопку/toggle прямо там де вона використовується. Людина сама вирішує per-action.

```
Де знаходиться        Функція              Безкоштовна альтернатива
────────────────────────────────────────────────────────────────────
Поле пошуку           [HyDE] toggle        Звичайний embed запиту
Результати пошуку     [AI Rerank] кнопка   MMR (локальний)
Settings → Chunking   [Contextual] toggle  Звичайний chunking
Item → reading pane   [Generate] кнопка, 
Item → reading pane   [Why?] кнопка, 
────────────────────────────────────────────────────────────────────
BM25 + cosine + RRF + MMR  →  завжди безкоштовно, завжди активно
```

Кожен toggle при вмиканні показує: "Це використає Groq API (~$0.001)"
Якщо GROQ_API_KEY відсутній → кнопки disabled з підказкою "Add Groq API key in Settings"

### Deliverables

#### Backend: Feedback Loop (implicit learning)
- [MODIFY] `src/routes/items.js`: при `POST /api/items/:id/star` та `POST /api/items/:id/approve`:
  - Витягти keywords з item через простий TF-IDF або взяти item embedding vector
  - Додати до профілю юзера (merge keywords, blend vectors)
  - Викликати `scheduler.invalidateProfileCache(userId)` щоб наступний цикл використав оновлений вектор
- [MODIFY] `src/db.js`: `blendProfileVector(userId, newVector, weight=0.1)`:
  - `new_profile_vector = 0.9 * current_profile_vector + 0.1 * item_vector`
  - Вектор профілю повільно зміщується в бік того що юзер схвалює
- Негативний сигнал (skip): вектор зміщується у протилежний бік (weight=-0.05)
- Логується: `logger.info({ userId, action: 'star', itemId }, 'Profile vector updated via feedback')`

Сигнали та ваги:
| Дія | Сигнал | Вага |
|-----|--------|------|
| ⭐ Star | сильний позитив | +0.15 |
| ✅ Approve | позитив | +0.10 |
| ⏭ Skip | негатив | -0.05 |

#### Frontend: Profile Editor
- Profile Editor (у Sidebar або окрема вкладка "My Profile"):
  - Textarea де людина пише вільним текстом: `"Мене цікавить Rust, async, системний дизайн, WebAssembly. Не цікавить: PHP, frontend frameworks."`
  - [Save Profile] → `POST /api/profiles` з `{ rawInput: text }` → бекенд генерує keywords + embedding vector → зберігає як active profile
  - [Clear] → скидає до порожнього
  - Показує поточний збережений профіль (keywords які система витягнула)
  - Показує дату останнього збереження

#### Frontend: Per-function AI toggles
- У полі пошуку: маленький toggle `[HyDE]` справа від кнопки пошуку
  - OFF (default): звичайний embed запиту
  - ON: Groq генерує hypothetical document → embed → кращий semantic пошук
  - При наведенні: tooltip з поясненням і прикладом:
    ```
    Smart Query Expansion (HyDE)
    Замість пошуку за твоїм текстом, AI спочатку уявляє
    ідеальний пост на цю тему, потім шукає схожі.

    Приклад: запит "rust async" →
    AI генерує: "Comparison of tokio and async-std runtimes
    in production Rust services: latency benchmarks..."
    → знаходить пости схожі на цей опис

    Використовує Groq API (~$0.001/пошук)
    ```
- У результатах пошуку: кнопка `[AI Rerank Top 20]`
  - Натискається після отримання результатів
  - Tooltip з поясненням і прикладом:
    ```
    AI Re-ranking
    LLM читає твій запит і кожен результат разом,
    і переставляє їх у правильний порядок.

    Приклад: звичайний пошук поставив на 1 місце пост
    де слово "rust" згадується 10 разів але тема інша.
    AI Rerank розуміє контекст і ставить його нижче.

    Використовує Groq API (~$0.02/запит)
    ```
- В Settings (Phase 3): toggle `[Contextual Chunking]`
  - Tooltip з поясненням і прикладом:
    ```
    Contextual Chunking
    При збереженні кожного нового поста, AI додає
    короткий контекст до кожного шматка тексту.

    Приклад: замість збереження "Add 2 tbsp butter..."
    зберігається "[French sauce recipe, beurre blanc section]
    Add 2 tbsp butter..." → пошук знаходить цей шматок
    навіть якщо запит не містить точних слів.

    Впливає тільки на нові пости (не переробляє існуючі)
    Використовує Groq API (~$0.001/пост)
    ```
- Якщо GROQ_API_KEY не налаштований → всі AI кнопки disabled, tooltip: "Add Groq API key in Settings to enable AI features"

#### Frontend: Search Quality Panel
- У Search view: після виконання запиту кожен результат показує:
  ```
  [Post Title]
  BM25: 0.82  |  Semantic: 0.74  |  RRF: 0.79
  Matched keywords: rust, async, performance
  ```
- Toggle "Debug scores" (можна сховати для чистого вигляду)
- Колір рядка залежить від combined score: зелений (>0.7), жовтий (0.4–0.7), сірий (<0.4)
- Якщо AI ON: показує мітку "HyDE" біля запиту (щоб людина розуміла що використовується)

#### Backend: Дедуплікований корпус + `user_matches` (передумова масштабу)
> Реалізує «Архітектурне уточнення v7.1». Робиться до Phase 4 (динамічні джерела), бо ті множать навантаження.
- [NEW] migration: `CREATE TABLE user_matches (user_id TEXT, item_id TEXT, score REAL, status TEXT DEFAULT 'new', created_at TEXT, PRIMARY KEY(user_id, item_id))` + індекси на `(user_id, status)`.
- [MODIFY] `src/db.js`: `fingerprint()` розгалужується по `collectionId` (internet → без userId; files → з userId).
- [MODIFY] `src/scheduler.js`: ембедити унікальний internet-контент один раз → `items`/`chunks`; для кожного юзера лише `cosine(itemVector, profileVector)` → запис у `user_matches` (без повторного ембедингу).
- [MODIFY] статус-роути та `getItemsPage`/`getItemCount`, для internet-колекції читають/пишуть статус через `user_matches`.
- Backfill: перенести `items.status` → `user_matches`; схлопнути дублі internet-контенту по `hash(content)`.

#### Backend: Semantic Near-Dedup при вставці (безкоштовно)
- [MODIFY] `src/scheduler.js`: перед збереженням chunk (лише `collection_id='internet'`):
  - Порівняти embedding нового chunk з останніми N chunk-векторами корпусу (не per-user, контент спільний)
  - `cosine_similarity > 0.95` → не зберігати (майже ідентичний контент)
  - Threshold 0.95 параметризується через `.env` (`DEDUP_THRESHOLD=0.95`)
  - Мета: якщо HN і Reddit обидва публікують одну й ту ж новину, chunk зберігається один раз

#### Backend: Search Engine покращення (безкоштовні)
- [MODIFY] `src/search-engine.js`: RRF замість зваженої суми:
  ```javascript
  // Було:
  score = 0.4 * bm25Score + 0.6 * cosineScore
  // Стало:
  score = 1/(60 + bm25Rank) + 1/(60 + semanticRank)
  ```
- [MODIFY] `src/search-engine.js`: MMR post-processing:
  - Після отримання top-50: відбирає top-N результати що є і релевантними і різноманітними
  - λ = 0.5 (баланс relevance/diversity), налаштовується
- [MODIFY] `POST /api/search`: повертає per-item scores: `{ bm25Rank, semanticRank, rrfScore, matchedKeywords }`

#### Backend: Per-function AI support
- [MODIFY] `POST /api/search`: приймає `{ useHyde: bool }` у body:
  - `useHyde: true` → 1 виклик Groq → hypothetical doc → embed → semantic search
  - `useHyde: false` (default) → embed query напряму
  - Response: `{ hydeUsed: bool, hypotheticalDoc?: string, ... }`
- [MODIFY] `POST /api/search/rerank`, вже існує, залишається явною дією
- [NEW] `src/hyde.js`: функція `hydeExpand(query, groqClient)` → string
- [MODIFY] `POST /api/profiles`: приймає `rawInput` → ProfileGenerator → keywords + vector → зберігає як active profile
- [MODIFY] `GET /api/profiles/active`, повертає поточний active profile
- [MODIFY] `POST /api/search`: per-item scores в response
- [NEW] `POST /api/seed-test-data` (dev-only), вставляє 15-20 штучних постів

#### Synthetic Data для верифікації
Набір 15–20 постів що дозволяє перевірити:

| Група | Пости | Очікуваний результат для query "rust async" |
|-------|-------|---------------------------------------------|
| Точний збіг | "Async Rust: tokio vs async-std" | Top 1-3, BM25 high + Semantic high |
| Семантичний збіг | "Coroutines in systems programming" (без слова rust) | Top 5-8, BM25 low, Semantic high |
| Частковий збіг | "Python asyncio tutorial" | Mid range, BM25 medium, Semantic medium |
| Не релевантний | "Best JavaScript frameworks 2024" | Bottom, обидва low |
| Пастка (ключове слово без змісту) | Пост де слово "rust" зустрічається але тема інша (іржа металу) | Має бути низько |

Ця таблиця є definition of correctness, якщо система дає правильне ранжування для цього набору, гібридний пошук працює.

### Definition of Done: Phase 2.5

```
─── Profile ───────────────────────────────────────────────────────────
- [ ] Profile Editor показує поточний active profile (raw text + extracted keywords)
- [ ] Людина пише вільний текст → Save → система генерує keywords + vector → зберігає
- [ ] GET /api/profiles/active повертає останній збережений профіль
- [ ] Scheduler автоматично використовує active profile з DB (не хардкод з JSON файлу)

─── Feedback Loop ─────────────────────────────────────────────────────
- [ ] Star/Approve → profile vector оновлюється (blend +0.10/+0.15)
- [ ] Skip → profile vector зміщується у протилежний бік (-0.05)
- [ ] scheduler.invalidateProfileCache викликається після кожного оновлення
- [ ] Після 10+ взаємодій: approval rate зростає (ручна перевірка)

─── Search Quality (безкоштовна частина) ──────────────────────────────
- [ ] RRF замінює зважену суму в search-engine.js
- [ ] MMR відбирає різноманітні результати після пошуку
- [ ] POST /api/search повертає per-item bm25Rank, semanticRank, rrfScore, matchedKeywords
- [ ] Search view показує scores під результатами (toggle debug mode)
- [ ] POST /api/seed-test-data вставляє 15-20 тестових постів (dev only)
- [ ] Пошук "rust async" по seed-даних → правильне ранжування (таблиця вище)
- [ ] Семантично схожий пост (без ключових слів) потрапляє у top-10
- [ ] Пост-пастка (ключове слово, інша тема) НЕ потрапляє у top-5

─── Per-function AI buttons ───────────────────────────────────────────
- [ ] [HyDE] toggle у полі пошуку: OFF за замовчуванням
- [ ] HyDE ON → POST /api/search з useHyde:true → Groq викликається → результати з міткою "HyDE"
- [ ] HyDE OFF → POST /api/search без HyDE → жодного виклику Groq
- [ ] [AI Rerank] кнопка у результатах, тільки після пошуку
- [ ] Без Groq API key → всі AI кнопки disabled з tooltip "Configure Groq API key"

─── Загальне ──────────────────────────────────────────────────────────
- [ ] All tests pass, coverage ≥ 80%
```

### Tests: Phase 2.5
```
tests/routes/profiles.test.js
  ✓ POST /api/profiles з rawInput → повертає keywords та id
  ✓ GET /api/profiles/active → повертає останній профіль
  ✓ POST /api/profiles без rawInput → 400

tests/search-engine-rrf.test.js
  ✓ RRF scores є комбінацією рангів, не зважених чисел
  ✓ Результат з rank=1 в обох списках має найвищий RRF score
  ✓ MMR відбирає різноманітні результати (схожі між собою відфільтровуються)

tests/routes/hyde.test.js
  ✓ POST /api/search з useHyde:true → Groq викликається (мокається), response містить hydeUsed:true
  ✓ POST /api/search з useHyde:false → Groq не викликається
  ✓ POST /api/search без Groq key та useHyde:true → 400 з повідомленням "Groq API key required"

tests/seed-data.test.js (integration)
  ✓ POST /api/seed-test-data вставляє 15 постів
  ✓ Пошук по seed-даних повертає правильний порядок
  ✓ Семантично схожий пост (без точних ключових слів) входить у top-10
```

### Rollback: Phase 2.5
| Якщо | Дія | Час |
|------|-----|-----|
| RRF ламає порядок результатів | Feature flag `USE_RRF=false` → повертає зважену суму | 2 хв |
| MMR погіршує результати | `MMR_LAMBDA=1.0` → вимикає diversity, залишає тільки relevance | 2 хв |
| HyDE повертає нерелевантний hypothetical doc | AI OFF → HyDE не викликається | instant |
| ProfileGenerator падає | Зберігати rawInput як keywords без обробки | 5 хв |
| Seed data конфліктує з реальними | Seed використовує `collection_id = '__test__'` | 5 хв |

---

## Phase 2.6: Consistency & Onboarding (закриття лінії Phase 2.5) (1 день)

### Scope
Закрити дві дрібниці після Phase 2.5 (рев'ю коду 2026-06-14):

1. Лічильники сайдбару рахують чужі колекції, бейджі Inbox включають files та
   `__test__`, хоча список інбоксу показує лише `internet`. Цифра не збігається з виглядом.
2. Порожній інбокс нового юзера: `user_matches` наповнюються лише новими циклами,
   тож свіжий юзер бачить пусто й не знає, що робити.

> Прибрано з 2.6 (рішення 2026-06-14): «пошук затирає профіль», це НЕ баг. За моделлю
> користувача пошук задає намір (як у браузері: ввів запит у табі → це намір табу).
> Поточна однопрофільна поведінка: коректний випадок «одного табу». Повна механіка
> (таб = намір + RSS + таймер → інбокс), Phase 4/5, не тут. Нові збіги приходять у
> Gmail-style інбокс (це і є «пошта»), окрема email-доставка НЕ потрібна.

### Deliverables

#### Backend
- [MODIFY] `src/routes/items.js` (`GET /api/items/stats`), лічильники Inbox фільтрують
  по `collectionId = 'internet'` (як список інбоксу), щоб бейджі рахували лише те, що показано.
  (Files мають власний рахунок окремо, якщо знадобиться.)
- [NEW] вітальні повідомлення при реєстрації, у `src/routes/auth.js` (register) після
  `createUser`: вставити 3 онбординг-items у корпус (idempotent, `source='system'`,
  `collection_id='internet'`, dedup по content природно дає один рядок на повідомлення) і
  створити `user_matches` для нового юзера (`status='new'`). При першому логіні юзер бачить
  їх в інбоксі (як 3 листи в Gmail), вони ведуть його, ніби він відкрив перший таб і його
  просять заповнити намір. Тексти:
  1. «Вітаємо: система приносить тобі в інбокс лише те, що цікавить».
  2. «Задай свій намір у My Profile: і нові збіги почнуть приходити сюди».
  3. «Став ⭐ / схвалюй ✅ / пропускай ⏭, система вчиться на твоїх діях».
  - db-хелпер `seedWelcomeForUser(userId)`.

#### Frontend
- Вітальні items рендеряться як звичайні (title + content). Спец-стиль, опційно, пізніше.

### Definition of Done: Phase 2.6
```
- [ ] Бейджі сайдбару рахують лише internet (files/__test__ не входять у Inbox-лічильники)
- [ ] Новий юзер після реєстрації має 3 вітальні повідомлення в інбоксі
- [ ] Вітальні пояснюють: задати намір (My Profile) + star/approve вчить систему
- [ ] All tests pass, coverage ≥ 80%
```

### Tests: Phase 2.6
```
tests/routes/items-stats.test.js (або доповнити server.test.js)
  ✓ stats рахують лише internet: files та __test__ items не входять у Inbox-лічильники

tests/middleware/auth.test.js (доповнити)
  ✓ register → інбокс нового юзера містить 3 вітальні items
  ✓ вітальні items ізольовані per-user (через user_matches), не дублюються в корпусі
```

### Rollback: Phase 2.6
| Якщо | Дія | Час |
|------|-----|-----|
| Лічильники після фіксу неправильні | Повернути `getItemCount` без collectionId | 5 хв |
| Вітальні захаращують / дублюються | Прибрати виклик `seedWelcomeForUser` з register | 5 хв |

---

## Phase 3: Settings, Health Dashboard & AI Enhancements (1 тиждень)

### Scope
Settings page (essential only), Health dashboard, Alert banners, Business events. Платні AI техніки що вмикаються окремими кнопками на рівні конкретної функції, не одним master switch.

### Deliverables

#### Backend
- [NEW] `src/routes/settings.js`
  - `GET /api/settings`: all settings as JSON
  - `POST /api/settings`: save (takes key and value, performs atomic key-value upsert)
  - `POST /api/settings/reset`: reset all key-values to defaults
- [MODIFY] `src/db.js`: migration: нормалізована таблиця `settings` (key TEXT PRIMARY KEY, value TEXT, type TEXT)
  - Запобігає race conditions, підтримує типізацію на рівні БД, дозволяє атомарне оновлення окремих ключів.
- [MODIFY] `src/config.js`: reads from `settings` table, falls back to `.env`
- [MODIFY] `src/routes/health.js`
  - `GET /api/health/full`: detailed status per module
  - ~~`GET /api/health/errors`: last 20 errors~~ → відкладено (рішення 2026-06-14):
    YAGNI: помилки ще невідомі; у dev видно в терміналі, у prod хост (pm2/systemd)
    захоплює stdout у файл. Додамо durable error-history (БД/файл) із реальної потреби.
- [NEW] `src/health-checker.js`: module health checks (cached, 30s TTL)
- Business events in critical routes:
  - `search.completed`, `sync.completed`, `item.approved`, `ai.generate.completed`

#### Backend: Importance Classification at Ingest (AI, платно, вмикається в Settings)
> ⏸ ВІДКЛАДЕНО (рішення 2026-06-14, YAGNI): платна Groq-класифікація на кожен item.
> Безкоштовний pre-filter уже прибирає очевидне сміття; платити за класифікацію має сенс
> лише за реального потоку/проблеми зі сміттям. Тумблер прибрано з Settings UI + SCHEMA.
> Будуємо, коли з'явиться реальна потреба.
- [MODIFY] `src/scheduler.js`: якщо `importance_classification_enabled = true` в settings:
  - Після pre-filter, перед embed: 1 виклик Groq → класифікує кожен item як `high | normal | junk`
  - Результат зберігається в `items.metadata.importance`
  - `junk` items зберігаються зі статусом `'skipped'` одразу (не показуються в inbox)
  - Логується скільки Groq викликів і приблизна вартість (~$0.0005/item)
- ItemRow показує мітку важливості: ● high (зелена), ● normal (сіра), без мітки = не класифіковано

#### Backend: Contextual Chunking (AI, платно, вмикається в Settings)
> ⏸ ВІДКЛАДЕНО (рішення 2026-06-14, YAGNI): платна оптимізація якості пошуку.
> Спершу зміряти поточну якість eval-стендом; додавати лише якщо стенд покаже потребу.
> Тумблер прибрано з Settings UI + SCHEMA. Будуємо за результатами вимірювання.
- [MODIFY] `src/chunker/index.js`: якщо `contextual_chunking_enabled = true` в settings:
  - Перед збереженням кожного chunk: 1 виклик Groq → LLM генерує короткий контекст (1-2 речення про те звідки цей chunk і що він описує)
  - Контекст додається як префікс до `chunk.content` перед embed
  - Існуючі chunks НЕ переробляються (тільки нові)
  - Логується скільки Groq викликів зроблено і приблизна вартість

#### Backend: HyDE (AI, платно, вмикається per-search)
- [MODIFY] `src/routes/search.js`: якщо `use_hyde = true` в request body:
  - 1 виклик Groq → генерує hypothetical document з query
  - Embed hypothetical document → використовується для semantic search
  - Response містить `{ hydeUsed: true, hypotheticalDoc: "..." }` (для debug panel)

#### Frontend
- Settings page (⚙ in sidebar):
  - Search: threshold (slider), mode (radio), weights (linked sliders)
  - Scheduler: enabled (toggle), schedule (time picker), cron on/off
  - Sources: checkboxes + per-source config (subreddits, limits)
  - AI: API key (set-only, masked), model (dropdown), prompts (editable instructions part only, system prompt readonly)
  - [Save] [Reset to Defaults]
- Health dashboard (System page):
  - Full table of modules with status, last check, details (styled strictly using custom SVG indicators)
  - Error history (last 20)
  - [Test Connection] per module
- Alert banner (top of content):
  - Yellow: warnings (source down, rate limit)
  - Red: critical (DB down, no API key)
  - [Fix] → navigate to Settings, [Dismiss] → hide
- Health footer (enhanced):
  - Custom SVG icons per module (no emojis)
  - Hover → tooltip with details ("Djinni: Connection timeout since 2h ago")
  - SVG indicator in sidebar with tooltip showing which modules failed

#### Docker
- Settings persist across container restarts (DB volume)
- Test: change settings → restart container → settings preserved

### Definition of Done: Phase 3

```
- [ ] Settings page renders with all essential settings
- [ ] Change setting → Save → settings persist in normalized key-value database table across restarts
- [ ] Reset to Defaults → all settings return to initial values in DB
- [ ] Settings validation: threshold 0-1, weights sum to 1, etc.
- [ ] Invalid setting value → clear error message in UI
- [ ] API key: can set new key, cannot see existing (masked)
- [ ] Health dashboard shows all modules with correct status using custom SVGs
- [ ] Error history shows last 20 errors
- [ ] Alert banner appears for critical/warning issues
- [ ] Alert banner disappears when issue resolved
- [ ] Footer tooltip shows detail per module
- [ ] Sidebar health status tooltip shows which modules have issues
- [ ] Cron on/off toggle works
- [ ] Business events logged for search, sync, approve, generate
- [ ] All tests pass, coverage ≥ 80%
```

### Settings: what's in UI vs what stays in .env

In UI (essential, юзер змінює):
| Setting | UI Control |
|---------|-----------|
| Search threshold | Slider 0.0-1.0 |
| Search mode | Radio: Sequential / Parallel |
| BM25 / Semantic weights | Linked sliders |
| Top N results | Number input |
| Sources on/off | Checkboxes |
| Reddit subreddits | Tag input |
| Djinni keywords | Tag input |
| Source limits | Number inputs |
| Cron enabled | Toggle |
| Cron schedule | Time picker |
| Groq API key | Password input (set-only) |
| Groq model | Dropdown |
| AI prompts (user instructions) | Textarea (system prompt readonly) |
| Chunking strategy | Radio: Semantic / Fixed |

In .env only (infrastructure):
`PORT`, `NODE_ENV`, `DB_PATH`, `CORS_ORIGIN`, `LOG_LEVEL`

In Advanced section (visible, rarely changed):
`GROQ_MAX_TOKENS`, `GROQ_RATE_LIMIT`, temperatures, batch sizes, upload limits

### Rollback: Phase 3
| Якщо | Дія | Час |
|------|-----|-----|
| Settings break search | [Reset to Defaults] button | 5 сек |
| Config read fails | Fallback: ignore settings table, use .env | 10 хв |
| Health checker crashes server | Disable health-checker.js, static health response | 5 хв |

---

## Phase 4: Files Mode + Dynamic Sources (1.5 тижні)

### Scope
Частина A: постійна бібліотека документів + scoped Match (query → top 50 → AI rerank → top 20).
Частина B: Dynamic source layer: юзер підключає власні джерела, не тільки HN/Reddit/Djinni.

> ⚠️ Part A переосмислено (рішення 2026-06-14): ПОСТІЙНА бібліотека + scoped search, НЕ ефемерно.
>
> Чим це НЕ тупий ATS (диференціатор): ATS має talent-pool, але ніколи його не шукає
> (keyword, поховано): тому «галочка майбутніх вакансій» дає нуль. Ми робимо пул живим:
> ейчар свідомо шукає по накопиченій базі крос-рольно, кандидат, що подавався пів року тому
> на іншу роль, спливає для нової. Різниця не «семантика замість keyword», а те, що ми
> використовуємо накопичене.
>
> Повна модель:
> - Постійна per-user `files` (вже є з Phase 2; БЕЗ `__temp_`/VACUUM/сесій, відкладено).
> - Дві незалежні дії:
>   1. Add documents (upload): *необов'язково*; росте бібліотека, кожне завантаження
>      тегується `batch_id`. Будь-які PDF (generic тип `document` + резюме-парсер як спеціалізація).
>   2. Match: права чаша = запит (опис вакансії / що шукаєш, *обов'язково*); ліва чаша =
>      бібліотека. Scope: комбіновані опції (і/або): [нова пачка] та/або [вся база].
>      Файли вантажити НЕ треба, якщо в базі ≥1 запис → просто запит + «вся база» + Match.
>      → топ-50 (безкоштовно) → AI-rerank → топ-20 (потрібен Groq-ключ).
> - Generic-документи: книги/дослідження теж шукані по всій бібліотеці, не лише останнє завантаження.
> - tab-сумісно (Phase 5 таб посилатиметься на цю колекцію).
>
> Наступний шар (пізніше): нема й у всій базі → система йде у відкритий веб (Internet/web-search).
> Внутрішній пул оживляємо зараз; зовнішній, потім.
>
> Тригер міграції на векторну БД (Qdrant/pgvector + ANN), коли пошук лагає (~100K–1M chunks).

### Dynamic Sources: концепція
Поточні 3 hardcoded джерела → замінюються на user-configurable registry.

4 рівні джерел (пріоритет від простого до складного):
1. RSS (найвищий ROI): `npm install rss-parser`, покриває 90% блогів/новин/YouTube/Reddit subreddits
2. Web Search APIs: Tavily ($0.001/запит, designed for AI/RAG), Brave Search (freemium 2k/міс)
3. Web Scrapers: Firecrawl (SaaS), Crawl4AI (open source Python self-hosted)
4. AI Autonomous: юзер дає URL, AI сам будує парсер (складно, фаза 5+)

DB schema для dynamic sources:
```sql
CREATE TABLE user_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,  -- 'rss' | 'tavily' | 'brave' | 'builtin'
  url TEXT,            -- для rss
  query TEXT,          -- для tavily/brave search queries
  label TEXT,          -- назва що показується в UI
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Adapter pattern поверх існуючого `sources/index.js`:
- Кожен тип має адаптер: `RSSAdapter`, `TavilyAdapter`, `BuiltinAdapter`
- Scheduler читає `db.getSourcesForUser(userId)` замість хардкоду
- Існуючі HN/Reddit/Djinni стають `type: 'builtin'`

### Deliverables

#### Backend
- [MODIFY] `src/routes/upload.js`
  - Save items with `collection_id = '__temp_${sessionId}'`
  - Before upload: clear previous temp items for this session
  - Return progress: `{ processed: 47, total: 500, chunks: 2340 }`
- [NEW] `src/routes/temp.js`
  - `DELETE /api/temp/clear`: clear all temp items for session. MUST run `VACUUM;` and `PRAGMA optimize;` after deletion to reclaim disk space and prevent database fragmentation.
- [MODIFY] PDF processing pipeline (in-thread synchronous execution + benchmark):
  - Спочатку реалізувати парсинг, чанкінг та ембедінги синхронно (в основному потоці).
  - Додати детальне логування тривалості обробки та блокування event loop для різного масштабу (5, 50, 100 файлів).
  - *Оптимізація:* Окремий `embedding-worker.js` (Worker thread) створюється та впроваджується лише за потреби, якщо виміри покажуть критичне блокування головного потоку Express (більше 60 секунд) при реальному навантаженні.
- Auto-cleanup:
  - On server start: delete `__temp_%` items older than 1 hour
  - Cron: every hour, clean stale temp data
- Reranker:
  - `POST /api/search/rerank`: takes top 50, returns top 20 with explanations

#### Frontend
- Files mode (окрема вкладка/секція, не mode switch):
  - Left panel: Upload area (drag & drop or file picker)
  - Right panel: Comparison input (textarea or PDF upload)
  - Upload progress bar: "Processing: 234/500 files..."
  - Results list: top 50 matches
  - [AI Rerank → Top 20] button (styled using SVG icons)
  - [Clear All] button
- Session-based: кожна вкладка браузера = окрема сесія

#### Docker
- Memory limit adequate for 500 PDFs in RAM

### Definition of Done: Phase 4

```
- [ ] Upload 5 PDFs → parsed → chunked → embedded → searchable
- [ ] Synchronous pipeline implemented, tested, and benchmarks logged for 5, 50, 100 files
- [ ] Progress indicator: "Processing 234/500..." works accurately
- [ ] Compare input (text) → Find Matches → top 50 results
- [ ] Compare input (PDF) → parsed → profile → Find Matches
- [ ] AI Rerank → top 20 with explanations
- [ ] Clear → all temp data removed and VACUUM completed successfully
- [ ] Auto-cleanup: stale temp data removed on server start
- [ ] Auto-cleanup: hourly cron removes >1h old temp data
- [ ] Two browser tabs → separate sessions → no data mixing
- [ ] Server stays responsive or worker thread fallback triggered if measurements exceed 60s
- [ ] All tests pass, coverage ≥ 80%
```

### Rollback: Phase 4
| Якщо | Дія | Час |
|------|-----|-----|
| In-thread execution blocks too long | Limit maximum batch upload size to 20 files in UI | 5 хв |
| Temp cleanup too aggressive | Increase TTL to 24h | 5 хв |
| Files mode breaks Internet mode | Disable files routes, Internet mode unaffected | 5 хв |

---

## Phase 5: Polish & Advanced (ongoing)

### Scope
Все що "nice to have" після working system.

### Deliverables (prioritized backlog)
1. Keyboard shortcuts (j/k навігація, e archive, r reply)
2. Virtual scrolling для 1000+ items
3. Advanced settings page (temperatures, batch sizes, upload limits)
4. Full AI prompts editor (with prompt preview and test)
5. Business events dashboard (searches/day, approval rate, AI costs)
6. SSE для real-time updates (cron complete, health changes)
7. Source: Web Search (`sources/web-search.js`)
8. Export/Import settings
9. Dark/Light theme toggle (implemented strictly with SVGs)
10. Mobile responsive layout
11. Living theme: третя опційна тема (Dark / Light / Living) на базі вже існуючих
    `client/src/hooks/useLivingDesign.js` + `MagneticButton.jsx` (зараз закомічені, але не підключені).
    Специфікація: `docs/LIVING_DESIGN.md`, `docs/TECH_LIVING_DESIGN.md`, `docs/DESIGN_STANDARD.md`.
    Дефолтні теми лишаються чистими (DoD Phase 2); Living, opt-in для тих, кому подобається.
12. Anonymous trial для Files Mode (відкладено 2026-06-12): optionalAuth middleware
    (декодує cookie, не кидає 401) + розгалуження по колекції (`files` → анонімно по sessionId,
    `internet` → 401 і Lock Screen) + жорсткіші rate limits для анонімів (uploads/год, розмір)
    + конверсійний банер «Зареєструйтесь, щоб зберегти результати та відкрити Internet Mode».
13. Multi-intent / багатовкладковість (VISION 3.3, gap, не в Phase 1-4; рішення 2026-06-14):
    один юзер відкриває безліч «вкладок», у кожній окремий збережений намір (профіль) і свій inbox.
    Архітектура (інсайт користувача): вкладка = «під-тенант», тобто перевикористати наявну
    ізоляцію (як кілька реєстрацій одного юзера), а не вигадувати нову модель з нуля.
    - Схема: `profiles` стає колекцією (N на юзера, з `id`+`label`); `user_matches` ключ
      розширюється на `intent_id`; scheduler матчить кожен item проти КОЖНОГО наміру.
    - ⚠️ Дедуп-корпус лишається спільним (embed раз), але матчинг знову множиться:
      O(intents × items). Це виправдовує оплату за вкладку, ціна збігається з вартістю.
    - Монетизація (ідея): брати гроші за кожну відкриту вкладку (per-tab / per-workspace,
      перевірений SaaS-патерн). Рішення про ціну, пізніше, на реальних даних; архітектура
      просто має робити вкладку лічильною одиницею.
    - ⚠️ Чому НЕ зараз: чіпає щойно стабілізоване ядро (scheduler matching, getItemsPage,
      статус-роути, feedback). Робити окремою фазою з власними тестами ПІСЛЯ деплою single-intent.
    - До тих пір: №1 (пошук затирає профіль) фіксується однопрофільно, пошук ефемерний,
      профіль міняється лише в Profile Editor (відповідає поточній моделі «один профіль на юзера»).

### Не має DoD: це continuous improvement.

---

## Success Metrics (вимірюємо поетапно)

### Коли тестуємо matching систему?
Phase 2.5: перший реальний тест. Вставляємо seed data (15-20 постів) і перевіряємо чи система правильно ранжує.

### Що і як вимірювати

1. Relevance (правильність ранжування), Phase 2.5
| Метрика | Як виміряти | Ціль |
|---------|-------------|------|
| Seed data ranking | 5 груп постів (таблиця в Phase 2.5) | ≥ 4/5 груп правильно |
| Semantic recall | Пост без ключових слів але схожий за змістом потрапляє у top-10 | Так |
| Anti-trap | Пост де є ключове слово але інша тема НЕ у top-5 | Так |
| Score distribution | Scores розподілені (0.2–0.9), не всі кластеровані в 0.6-0.7 | Так |

2. User satisfaction (реальне використання), Phase 2.5+
| Метрика | Як виміряти | Ціль |
|---------|-------------|------|
| Approval rate | (starred + approved) / total shown | > 30% |
| Skip rate | skipped / total shown | < 40% |
| Precision@10 | З перших 10 показаних, скільки релевантних (вручну) | ≥ 6/10 |

3. Feedback Loop effectiveness: Phase 2.5 (після 1 тижня використання)
| Метрика | Як виміряти | Ціль |
|---------|-------------|------|
| Profile convergence | Approval rate через 7 днів vs день 1 | Зростає |
| Skip rate trend | Skip rate через 7 днів vs день 1 | Зменшується |

4. System reliability: кожна фаза
| Метрика | Як виміряти | Ціль |
|---------|-------------|------|
| System starts without errors | Startup diagnostics | 100% |
| Cron runs successfully | Health endpoint | > 95% |
| All modules healthy after deploy | Health dashboard | 9/9 green |
| Test coverage | `npm test -- --coverage` | Statements ≥ 80%, Branches ≥ 80% |

5. Scale limits (Oracle Cloud Always Free, ARM Ampere), Phase 4+
> Хостинг: Oracle Cloud Always Free (ARM Ampere A1, до 4 vCPU / 24GB RAM, постійний диск). Завжди-on, тож крон і SQLite-файл живуть стабільно. Раніше: render.com free (спить за 15хв, ефемерний диск), непридатний для stateful+cron.
| Метрика | Як виміряти | Ціль |
|---------|-------------|------|
| Унікальних ембедингів/цикл | ембединги для НОВОГО контенту (не × users) | = к-ть унікальних chunks, не залежить від N юзерів |
| Embedding throughput | items/хвилину при local MiniLM (ARM) | > 60 items/хв |
| Memory at peak | `process.memoryUsage()` під час sync | < 1GB (з запасом на 24GB RAM) |
| Search latency | p95 response time для POST /api/search | < 500ms |

---

## Timeline

```
Week 1 (days 1-3): Phase 1: Fix the Gap              ✅ DONE
  Mon: startup.js + health endpoint + scheduler chunking
  Tue: DB migration + React inbox + health footer
  Wed: Tests + Docker verify + DoD checklist

Week 2: Phase 2: Gmail Layout + Multi-User Auth       ✅ DONE
  Mon-Tue: 3-column layout + cursor pagination + themes
  Wed-Thu: Reading pane + actions + Error Boundary
  Fri: Tests + DoD checklist
  Done: multi-user auth, user isolation, search saves profile, 388 tests green
  Техборг (закривається у Week 3): per-user fingerprint → дедуп-корпус + user_matches (v7.1)

Week 3: Phase 2.5: Profile-Driven Search & Quality   🔜 NEXT
  Mon: Дедуп-корпус + user_matches міграція (Архітектурне уточнення v7.1)  ← передумова
  Mon-Tue: Profile Editor UI + POST /api/profiles (rawInput → keywords+vector)
  Wed: Per-item scores in search response + Debug panel in UI
  Thu: Seed test data + visual verification of hybrid search
  Fri: Tests + DoD checklist

Week 4: Phase 3: Settings & Health
  Mon-Tue: Settings page + backend + validation
  Wed-Thu: Health dashboard + alerts + business events
  Fri: Tests + DoD checklist

Week 5: Phase 4: Files Mode
  Mon-Tue: Upload + synchronous pipeline + benchmarks
  Wed-Thu: Compare + rerank + cleanup (VACUUM)
  Fri: Tests + DoD checklist

Week 6+: Phase 5: Polish (ongoing)

Git-стратегія: `main` = задеплоєний продукт (PLAN v4) з реальними клієнтами, НЕ мержити, доки v7 не готовий його замінити.
Фазові гілки йдуть стеком: main → feature/phase-1-fix-gap → feature/phase-2-gmail-layout → feature/phase-2.5-… (нова фаза, від попередньої).
Коміти: conventional commits з фазою в скоупі (feat(phase-2): …), без співавтора. Кожну гілку пушити на origin (бекап).
```

---

## Принципи написання тестів (узгоджено після Phase 1)

### Головне правило
Кількість тестів: це метрика, не гарантія якості.
340 тестів означає "ми не зламали явні шляхи", але не означає "система працює правильно".
Тест має цінність тільки якщо він може зламатися коли ти щось зламаєш.

### Що робити (правильно)

1. Integration тести важливіші за unit тести з моками
Справжній захист дають 3-4 тести які запускають повний цикл без мокованих бізнес-залежностей:
- scheduler → DB → search → HTTP response
- upload PDF → parse → embed → searchable

2. Real dependencies де можливо
- DB: завжди `:memory:` SQLite, ніколи не мокати
- HTTP: завжди `supertest`, ніколи не мокати Express middleware
- Pure functions (SearchEngine, validation, parsers): ніколи не мокати
- External API (Groq, HN, Reddit): мокати завжди

3. Тест перевіряє поведінку, не реалізацію
```javascript
// ПОГАНО: перевіряє що мок викликався (перевіряє реалізацію)
expect(saveToExportFile).toHaveBeenCalledWith('id', item, 'comment');

// ДОБРЕ: перевіряє що стан системи змінився (перевіряє поведінку)
const saved = db.getItemById('id');
expect(saved.response).toBe('comment');
```

### Що НЕ робити

"Coverage-driven" тести: написані щоб цифра була 80%, а не щоб знайти баги.
Ознаки: тест мокає все підряд і перевіряє тільки що моки викликались.

Один великий файл для "uncovered branches", `integration-tests-uncovered.test.js` є антипатерном.
Кожен тест має жити поруч з тим що тестує (`db.test.js`, `scheduler.test.js`), а не в загальному "латальному" файлі.

Моки зовнішніх залежностей без перевірки контракту, якщо мок Groq API повертає `"Mock response"`,
а реальний Groq змінює формат відповіді, тест продовжує проходити, але система зламана.

### Технічний борг в поточних тестах (Phase 1)
- `integration-tests-uncovered.test.js`, розбити по тематичних файлах в Phase 5
- `groq-client.test.js`, `reranker.test.js`, `explainer.test.js`, написані для coverage,
  додати реальні контрактні тести коли будуть integration тести з Groq sandbox
- Race condition між `api.test.js` і `integration-tests-uncovered.test.js` через `data/export.json`, виправити в Phase 3
