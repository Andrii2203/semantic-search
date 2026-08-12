# Universal Matching Engine — PLAN v7 (Execution Plan)

## Контекст

**Тип:** Персональний інструмент, побудований як продукт.  
**Мета:** Навчитися будувати production-grade систему одному.  
**Підхід:** Фазова доставка. Кожна фаза = working system + тести + Docker.  
**Якість:** Без компромісів. Як для команди з 10 людей, але робить 1.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         REACT UI (Gmail-inspired)               │
│  ┌──────────┬──────────────────────┬──────────────────────────┐ │
│  │ Sidebar  │ List (Inbox/Results) │ Detail (Reading Pane)    │ │
│  │          │                      │                          │ │
│  │ Inbox    │ ☐ Post title · 87%   │ Full content             │ │
│  │ Starred  │ ☐ Post title · 92%   │ [Generate] [Why?]        │ │
│  │ Done     │                      │ [Approve] [Skip]         │ │
│  │ Skipped  │                      │                          │ │
│  │ ──────── │                      │                          │ │
│  │ ⚙ System │                      │                          │ │
│  │ ✅ 9/9   │                      │                          │ │
│  └──────────┴──────────────────────┴──────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ✅ DB  ✅ HN  ✅ Reddit  ⚠️ Djinni  ✅ Model │ Footer   │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        EXPRESS API                              │
│  /api/items · /api/search · /api/health · /api/settings        │
├─────────────────────────────────────────────────────────────────┤
│  Startup     │ Scheduler  │ Search Engine  │ Health Checker     │
│  Diagnostics │ (cron)     │ (BM25+cosine)  │ (modules status)   │
├─────────────────────────────────────────────────────────────────┤
│                    SQLite (WAL mode)                             │
│  items │ chunks │ chunks_fts │ profiles │ settings              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Ключові рішення (після критичного огляду)

| Рішення | Було | Стало | Чому |
|---------|------|-------|------|
| Gmail UI | Точна копія | Gmail-**inspired** MVP layout | Точна копія = 3 місяці, inspired = 1 тиждень |
| Settings в UI | Всі 40+ | **Essential** (8-10) в UI, решта Advanced | Менше багів, менше поверхня для помилок |
| Config source | DB → .env → defaults | `.env` bootstrap → `settings` table (єдине джерело) | Одне джерело правди |
| AI prompts | Повне редагування | System prompt readonly + editable instructions | Захист від prompt injection |
| Settings table | Key-value (TEXT) | Один JSON рядок | Типізація, простота, атомарність |
| Startup | Немає | **Startup diagnostics** | Критично — знати чи система ready |
| PDF processing | Main thread | **Worker thread** (Phase 4) | 500 PDF = 4 хв блокування |
| Temp cleanup | Manual Clear | Auto-cleanup (1 год TTL) + manual Clear | Crash safety |
| API key | Visible в UI | **Set-only** (можна замінити, не можна побачити) | Security |
| Error handling | Тільки backend | **Error Boundary** + business events | Production grade |

---

## Phase 1: Fix the Gap (3 дні)

### Scope
Зробити систему **працюючою end-to-end**: scheduler → chunks → search → inbox в React UI.

### Deliverables

#### Backend
- **[NEW] `src/startup.js`** — startup diagnostics
  - Перевіряє: DB connection, embedding model load, Groq API reachability, FTS5 integrity
  - Пробує згенерувати тестовий embedding (384-dim vector check)
  - Результат → `GET /api/health` (basic)
  - Якщо embedding fail → стартуємо в degraded mode (без semantic search)
  - Якщо DB fail → не стартуємо

- **[MODIFY] `src/scheduler.js`** — після insertItems → chunk + embed + save chunks
  - Scheduler uses active profile from `profiles` table (not JSON file)
  - Items saved with `collection_id = 'internet'`

- **[MODIFY] `src/db.js`** — migration: add `collection_id` to `items`
  - Backfill existing items: `collection_id = 'internet'`
  - Add index on `collection_id`

- **[NEW] `src/routes/health.js`** — basic health endpoint
  - `GET /api/health` → `{ status, modules: { db, embedding, groq, scheduler } }`

- **[MODIFY] `src/server.js`**
  - Call `startup.js` before listening
  - Log startup diagnostics results
  - Enable scheduler (read profile from DB)
  - Mount health routes

#### Frontend
- **[MODIFY] React UI** — показати items з БД
  - Простий inbox list (no Gmail layout yet)
  - `GET /api/items` → render list
  - Click item → show detail
  - Search input → `POST /api/search` → show results
  - Basic health footer: ✅/❌ per module

#### Docker
- Verify `docker-compose up` → startup diagnostics → all green
- Hot-reload працює для backend і frontend

### Definition of Done — Phase 1

```
- [ ] `docker-compose up` → startup diagnostics pass
- [ ] Startup log shows: DB ✅, Embedding ✅, Groq ✅/⚠️, FTS5 ✅
- [ ] If embedding model fails → server starts, health shows "degraded"
- [ ] Scheduler loads profile from DB (not JSON file)
- [ ] Scheduler run → fetches items → creates chunks → saves vectors
- [ ] `GET /api/items` returns items with collection_id
- [ ] `POST /api/search` returns results filtered by collection_id
- [ ] React UI shows inbox list from /api/items
- [ ] React UI shows search results from /api/search
- [ ] React UI shows health footer with module statuses
- [ ] `GET /api/health` returns correct status for all modules
- [ ] All existing tests pass (`npm test`)
- [ ] New tests: startup.js (all paths), scheduler chunking, health endpoint
- [ ] Test coverage ≥ 90%
```

### Tests — Phase 1
```
tests/startup.test.js
  ✓ checkDatabase — success case
  ✓ checkDatabase — failure case (DB not initialized)
  ✓ checkEmbeddingModel — success case (384-dim vector)
  ✓ checkEmbeddingModel — failure case (model not found)
  ✓ checkGroqAPI — no key → degraded
  ✓ checkGroqAPI — key present → ok
  ✓ runStartupChecks — all pass → healthy
  ✓ runStartupChecks — embedding fails → degraded (not crash)
  ✓ runStartupChecks — DB fails → critical (don't start)

tests/scheduler-chunking.test.js
  ✓ runCycle creates chunks for each item
  ✓ runCycle generates embeddings for chunks
  ✓ runCycle uses profile from DB (not JSON)
  ✓ runCycle sets collection_id = 'internet'

tests/routes/health.test.js
  ✓ GET /api/health returns all module statuses
  ✓ GET /api/health reflects degraded state
```

### Rollback — Phase 1
| Якщо | Дія | Час |
|------|-----|-----|
| collection_id migration breaks | `ALTER TABLE items DROP COLUMN collection_id` | 5 хв |
| Scheduler chunking fails | Revert scheduler.js, comment out chunking | 10 хв |
| Startup diagnostics blocks boot | Remove startup.js call from server.js | 2 хв |

---

## Phase 2: Core UX — Gmail Layout (1 тиждень)

### Scope
Gmail-inspired layout: sidebar + list + reading pane. Core actions: Generate, Copy, Approve, Skip.

### Deliverables

#### Frontend (повний редизайн)
- **Layout:** 3-column Gmail-inspired
  - Sidebar: Inbox (count), Starred, Done, Skipped, Mode switch, System status
  - List: items з score, source, time
  - Detail: content + action buttons
- **Actions:**
  - [✨ Generate Comment] → `POST /api/items/:id/generate` → show AI response
  - [📋 Copy] → clipboard
  - [🔄 Regenerate] → re-call generate
  - [✓ Approve] → `POST /api/items/:id/status` body: `{status: 'approved'}`
  - [✕ Skip] → same, `{status: 'skipped'}`
  - [⭐ Star] → `{status: 'starred'}`
  - [🤖 Why this match?] → `POST /api/search/explain`
- **Search input** (persistent profile):
  - Textarea в top bar або як "Compose" modal
  - [Save] → `POST /api/profiles` (saves to DB)
  - Показує поточний active profile
- **Error Boundary:**
  - Global ErrorBoundary component
  - Friendly message + Reload button
  - Reports to `POST /api/client-error`
- **Pagination:**
  - Cursor-based: `GET /api/items?cursor=...&limit=50`
  - Load more button або infinite scroll

#### Backend
- **[MODIFY] `src/routes/items.js`** — cursor pagination
- **[NEW] `src/routes/client-error.js`** — frontend error reporting
- **[MODIFY] `src/routes/items.js`** — star/unstar endpoint

#### Docker
- React dev server hot-reload через docker-compose override
- Production build test: `docker-compose -f docker-compose.yml up`

### Definition of Done — Phase 2

```
- [ ] Gmail-inspired 3-column layout renders
- [ ] Sidebar shows correct counts per category
- [ ] Click category → filters list
- [ ] Click item in list → shows in reading pane
- [ ] Generate Comment → AI response appears
- [ ] Copy → clipboard works
- [ ] Approve/Skip/Star → status updates, item moves to correct category
- [ ] "Why this match?" → explanation appears
- [ ] Search input → saves profile to DB
- [ ] Scheduler uses saved profile
- [ ] Pagination works (50 items per page)
- [ ] Error Boundary catches React errors → friendly UI
- [ ] Client errors reported to backend
- [ ] Legacy UI (`public/`) redirects to React with deprecation banner
- [ ] All tests pass, coverage ≥ 90%
```

### Tests — Phase 2
```
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
```

### Rollback — Phase 2
| Якщо | Дія | Час |
|------|-----|-----|
| React UI broken | Remove redirect, legacy UI at `public/` still works | 2 хв |
| Pagination breaks API | Revert to `limit/offset` (existing) | 10 хв |

---

## Phase 3: Settings & Health Dashboard (1 тиждень)

### Scope
Settings page (essential only), Health dashboard, Alert banners, Business events.

### Deliverables

#### Backend
- **[NEW] `src/routes/settings.js`**
  - `GET /api/settings` — all settings as JSON
  - `POST /api/settings` — save (with validation)
  - `POST /api/settings/reset` — reset to defaults
- **[MODIFY] `src/db.js`** — migration: `settings` table (single JSON row)
- **[MODIFY] `src/config.js`** — reads from `settings` table, falls back to `.env`
- **[MODIFY] `src/routes/health.js`**
  - `GET /api/health/full` — detailed status per module
  - `GET /api/health/errors` — last 20 errors
- **[NEW] `src/health-checker.js`** — module health checks (cached, 30s TTL)
- **Business events** in critical routes:
  - `search.completed`, `sync.completed`, `item.approved`, `ai.generate.completed`

#### Frontend
- **Settings page** (⚙ in sidebar):
  - 🔍 Search: threshold (slider), mode (radio), weights (linked sliders)
  - 📅 Scheduler: enabled (toggle), schedule (time picker), cron on/off
  - 🌐 Sources: checkboxes + per-source config (subreddits, limits)
  - 🤖 AI: API key (set-only, masked), model (dropdown), prompts (editable instructions part only, system prompt readonly)
  - [Save] [Reset to Defaults]
- **Health dashboard** (System page):
  - Full table of modules with status, last check, details
  - Error history (last 20)
  - [Test Connection] per module
- **Alert banner** (top of content):
  - Yellow: warnings (source down, rate limit)
  - Red: critical (DB down, no API key)
  - [Fix] → navigate to Settings, [Dismiss] → hide
- **Health footer** (enhanced):
  - Icons per module
  - Hover → tooltip with details ("Djinni: Connection timeout since 2h ago")
  - "7/9" counter in sidebar with tooltip showing which 2 failed

#### Docker
- Settings persist across container restarts (DB volume)
- Test: change settings → restart container → settings preserved

### Definition of Done — Phase 3

```
- [ ] Settings page renders with all essential settings
- [ ] Change setting → Save → setting persists across restarts
- [ ] Reset to Defaults → all settings return to initial values
- [ ] Settings validation: threshold 0-1, weights sum to 1, etc.
- [ ] Invalid setting value → clear error message in UI
- [ ] API key: can set new key, cannot see existing (masked)
- [ ] Health dashboard shows all modules with correct status
- [ ] Error history shows last 20 errors
- [ ] Alert banner appears for critical/warning issues
- [ ] Alert banner disappears when issue resolved
- [ ] Footer tooltip shows detail per module
- [ ] Sidebar "7/9" tooltip shows which modules have issues
- [ ] Cron on/off toggle works
- [ ] Business events logged for search, sync, approve, generate
- [ ] All tests pass, coverage ≥ 90%
```

### Settings — what's in UI vs what stays in .env

**In UI (essential, юзер змінює):**
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

**In .env only (infrastructure):**
`PORT`, `NODE_ENV`, `DB_PATH`, `CORS_ORIGIN`, `LOG_LEVEL`

**In Advanced section (visible, rarely changed):**
`GROQ_MAX_TOKENS`, `GROQ_RATE_LIMIT`, temperatures, batch sizes, upload limits

### Rollback — Phase 3
| Якщо | Дія | Час |
|------|-----|-----|
| Settings break search | [Reset to Defaults] button | 5 сек |
| Config read fails | Fallback: ignore settings table, use .env | 10 хв |
| Health checker crashes server | Disable health-checker.js, static health response | 5 хв |

---

## Phase 4: Files Mode (1 тиждень)

### Scope
Upload PDFs → compare with query/PDF → top 50 → AI rerank → top 20. Ephemeral data.

### Deliverables

#### Backend
- **[MODIFY] `src/routes/upload.js`**
  - Save items with `collection_id = '__temp_${sessionId}'`
  - Before upload: clear previous temp items for this session
  - Return progress: `{ processed: 47, total: 500, chunks: 2340 }`
- **[NEW] `src/routes/temp.js`**
  - `DELETE /api/temp/clear` — clear all temp items for session
- **[NEW] `src/workers/embedding-worker.js`**
  - Worker thread for processing 500+ PDFs
  - Reports progress back to main thread
  - Main thread stays responsive during processing
- **Auto-cleanup:**
  - On server start: delete `__temp_%` items older than 1 hour
  - Cron: every hour, clean stale temp data
- **Reranker:**
  - `POST /api/search/rerank` — takes top 50, returns top 20 with explanations

#### Frontend
- **Files mode** (окрема вкладка/секція, не mode switch):
  - Left panel: Upload area (drag & drop or file picker)
  - Right panel: Comparison input (textarea or PDF upload)
  - Upload progress bar: "Processing: 234/500 files..."
  - Results list: top 50 matches
  - [🤖 AI Rerank → Top 20] button
  - [🗑 Clear All] button
- **Session-based:** кожна вкладка браузера = окрема сесія

#### Docker
- Worker thread works in container
- Memory limit adequate for 500 PDFs in RAM

### Definition of Done — Phase 4

```
- [ ] Upload 5 PDFs → parsed → chunked → embedded → searchable
- [ ] Upload 500 PDFs → worker thread → main thread responsive
- [ ] Progress indicator: "Processing 234/500..."
- [ ] Compare input (text) → Find Matches → top 50 results
- [ ] Compare input (PDF) → parsed → profile → Find Matches
- [ ] AI Rerank → top 20 with explanations
- [ ] Clear → all temp data removed
- [ ] Auto-cleanup: stale temp data removed on server start
- [ ] Auto-cleanup: hourly cron removes >1h old temp data
- [ ] Two browser tabs → separate sessions → no data mixing
- [ ] Server stays responsive during 500 PDF processing
- [ ] All tests pass, coverage ≥ 90%
```

### Rollback — Phase 4
| Якщо | Дія | Час |
|------|-----|-----|
| Worker thread crashes | Fallback: process in main thread (blocking but working) | 15 хв |
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
9. Dark/Light theme toggle
10. Mobile responsive layout

### Не має DoD — це continuous improvement.

---

## Success Metrics (вимірюємо після Phase 2)

| Метрика | Як виміряти | Ціль |
|---------|-------------|------|
| System starts without errors | Startup diagnostics | 100% |
| Cron runs successfully | Health endpoint | > 95% |
| Search returns relevant results | Manual review, approval rate | > 30% approved |
| Time from "post appeared" to "comment generated" | Business events | < 2 хвилини |
| UI is usable without docs | Self-test (ти сам, 1-10) | > 7/10 |
| All modules healthy after deploy | Health dashboard | 9/9 green |

---

## Timeline

```
Week 1 (days 1-3): Phase 1 — Fix the Gap
  Mon: startup.js + health endpoint + scheduler chunking
  Tue: DB migration + React inbox + health footer
  Wed: Tests + Docker verify + DoD checklist

Week 2: Phase 2 — Gmail Layout
  Mon-Tue: 3-column layout + sidebar + list
  Wed-Thu: Reading pane + Generate + Approve/Skip + Error Boundary
  Fri: Tests + DoD checklist

Week 3: Phase 3 — Settings & Health
  Mon-Tue: Settings page + backend + validation
  Wed-Thu: Health dashboard + alerts + business events
  Fri: Tests + DoD checklist

Week 4: Phase 4 — Files Mode
  Mon-Tue: Upload + worker thread + progress
  Wed-Thu: Compare + rerank + cleanup
  Fri: Tests + DoD checklist

Week 5+: Phase 5 — Polish (ongoing)
```
