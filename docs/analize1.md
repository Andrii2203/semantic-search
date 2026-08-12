# Semantic Search Engine — Code Review (v4 Implementation)

## Загальна оцінка

**116 тестів, 10 test suites, 99.11% statement coverage, 99.77% line coverage.**
Це серйозний проект. Не демка, не MVP — а працюючий продукт з production-grade інженерними рішеннями.

> [!TIP]
> Ця кодова база краще ніж те що я бачу в ~80% комерційних Node.js проектів рівня junior-mid. Гарна робота.

---

## ✅ ЩО ЗРОБЛЕНО ДОБРЕ

### 1. Архітектурна ізоляція — виконано як задумано

`search-engine.js` **реально ізольований** — нуль залежностей від проекту. Є навіть тест який це перевіряє:

```javascript
// search-engine.test.js:87
test('search-engine.js does not import any project modules (isolation check)', () => {
  const projectImports = source.split('\n')
    .filter(line => line.includes(`require('./`) || line.includes(`require('../`));
  expect(projectImports).toHaveLength(0);
});
```

Це рівень інженерної дисципліни який рідко бачиш. Respekt.

---

### 2. Source Registry Pattern — чисто зроблено

Патерн реєстрації source'ів через `register()` + `fetchAll()` з failure isolation:

- [sources/index.js](file:///c:/Users/Andrii/Desktop/semantic-search/src/sources/index.js) — Map-based реєстр
- `Promise.allSettled` для ізоляції помилок
- Два рівні захисту: try/catch всередині map + allSettled зовні
- `clearSources()` для тестування

Тести це підтверджують — один source падає, решта працює:

```javascript
// hn.test.js:196
test('one source failing does not block others', async () => {
  const items = await sourcesModule.fetchAll();
  expect(items).toHaveLength(1); // тільки "good" source
  expect(badSource.fetch).toHaveBeenCalled(); // "bad" був викликаний
});
```

---

### 3. Action Registry — дзеркальний патерн

Actions використовують той самий підхід що і Sources — `register()`, Map, ізоляція. Консистентність.

Плюс кожен action самостійний — має `name`, `types[]`, `run()`. Додати новий action = один файл. Нічого більше міняти не потрібно. План v4 обіцяв це — код дотримує обіцянку.

---

### 4. Database Layer — солідно

- WAL mode для кращої паралельності
- Транзакційний batch insert
- Fingerprint через SHA-256 для дедуплікації
- Автоматичні міграції з відслідковуванням
- `INSERT OR IGNORE` — ідемпотентність

---

### 5. Error Handling — продакшн рівень

- `AppError` з кодами, HTTP статусами
- Global error handler в Express (корректно обробляє і AppError і unknown errors)
- Production mode приховує деталі помилок
- Retry з exponential backoff, onRetry callback, `RETRY_EXHAUSTED` error code з `cause`

---

### 6. Testing Culture

- 116 тестів, всі зелені
- Кожен модуль має свій test file
- Мокання fetch, Groq API, search engine — правильно ізольовано
- Edge cases покриті: порожні масиви, null input, мережеві помилки
- In-memory SQLite для тестів — швидко, чисто

---

### 7. Frontend — приємно та функціонально

- Dark mode з CSS variables
- Responsive layout
- Event delegation замість окремих listeners
- Loading skeletons
- Toast notifications
- Source filtering через checkboxes
- `escapeHtml()` через DOM (безпечний підхід проти XSS)

---

### 8. DevOps

- Multi-stage Docker build
- Non-root user в контейнері
- HEALTHCHECK directive
- `.env.example` з документацією кожної змінної
- `engines: { node: ">=18.0.0" }` в package.json

---

## ⚠️ ЩО МОЖНА ПОКРАЩИТИ

### Проблема 1: Дублювання Groq API виклику

В `server.js` (рядки 157-219) є **inline Groq API call** в `/api/items/:id/generate`. Та сама логіка що в `generate-comment.js`. Це порушує DRY:

```javascript
// server.js:171 — inline Groq call
const apiRes = await globalThis.fetch('https://api.groq.com/openai/v1/chat/completions', { ... });

// generate-comment.js:18 — та сама логіка
const res = await globalThis.fetch('https://api.groq.com/openai/v1/chat/completions', { ... });
```

**Рекомендація:** endpoint `/api/items/:id/generate` повинен викликати `generateComment.run(item)` замість дублювання HTTP виклику. У тебе вже є action system — використай її.

---

### Проблема 2: `saveToExportFile()` — синхронний file I/O в request handler

```javascript
// server.js:274
fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf-8');
```

`writeFileSync` блокує event loop. При 100+ items це буде помітно. Плюс `require('fs')` і `require('path')` робиться всередині функцій (рядки 223-224, 242-243) — це антипатерн:

```javascript
// server.js:223 — require всередині функції
app.get('/api/export', (_req, res, next) => {
  try {
    const fs = require('fs');    // ← кожен запит
    const path = require('path'); // ← кожен запит
```

**Рекомендація:** винеси `require` на верх файлу, заміни `writeFileSync` на `fs.promises.writeFile`.

---

### Проблема 3: Закоментований код в scheduler.js

Рядки 41-86 — цілий закоментований блок `runCycle()`:

```javascript
// async function runCycle() {
//   if (isRunning) {
//     ...
// }
```

Це 45 рядків мертвого коду. Git зберігає історію — видали.

---

### Проблема 4: Scheduler вимкнений в production

```javascript
// server.js:317-318
// scheduler.start();
// scheduler.runCycle().catch((err) => logger.error({ err }, 'Initial cycle failed'));
```

Scheduler закоментований. У плані v4 (Фаза 6) написано: «Після запуску scheduler, нові items з'являються в DB і UI». Але реально scheduler працює тільки через manual trigger кнопкою "Fetch Posts".

Це **свідомий вибір** (manual mode), але план це не відображає. Або розкоментуй, або оновити план.

---

### Проблема 5: Немає `devto.js` source

План v4 каже:
```
/sources
  hn.js
  reddit.js
  devto.js     — Dev.to
  djinni.js    — Djinni (версія 2.0)
```

`devto.js` відсутній, але `djinni.js` є (хоча він планувався на v2.0). Тобто ти зробив більше ніж план казав в одному місці, і менше в іншому. Не проблема, але слід оновити план.

---

### Проблема 6: `djinni.js` — HTML scraping = крихкий source

```javascript
// djinni.js:38
const blocks = html.split('class="job-item ');
```

HTML scraping через `string.split()` + regex — це найбільш крихка частина проекту. Будь-яка зміна HTML структури Djinni зломає парсер. Це не баг, це просто факт — ти це знаєш, але:

**Рекомендація:** додай smoke test який фетчить реальний HTML з Djinni і перевіряє що парсер повертає > 0 items. Запускай його вручну, не в CI. Коли Djinni змінить верстку — тест впаде першим.

---

### Проблема 7: `istanbul ignore next` зловживання

Я нарахував **~15** `/* istanbul ignore next */` коментарів. Деякі виправдані (lazy loading ML model), але деякі просто ховають непокритий код:

```javascript
// db.js:86 — чому ignore?
/* istanbul ignore next */
const applied = new Set(
  db.prepare('SELECT name FROM migrations').all().map((r) => r.name),
);
```

Цей код можна тестувати. `istanbul ignore` тут просто для покращення метрики.

**Рекомендація:** справжній coverage 99.77% краще ніж штучний 99.77% з 15 ignore. Видали ignore де можеш — реальна метрика чесніша.

---

### Проблема 8: `job_hunter.json` — один keyword-рядок

```json
{
  "keywords": [
    "I build autonomous AI agents that use retrieval augmented generation to answer questions from a knowledge base"
  ]
}
```

Один довгий рядок як keywords — це не keywords, це опис. `content.json` робить це правильно (масив коротких фраз). `job_hunter.json` — ні. Embedding з одного довгого рядка буде менш ефективний ніж з кількох цільових фраз.

---

### Проблема 9: CRLF inconsistency

`djinni.js` має `\r\n` (Windows line endings), решта файлів — `\n` (Unix). Додай в `.gitattributes`:
```
* text=auto eol=lf
```
Потім один раз зроби:
```bash
git add --renormalize .
git commit -m "fix: normalize line endings to LF"
```

---

### Проблема 10: `server.js` — God Module tendency

`server.js` на 329 рядків і робить **забагато**:
- Express setup
- All route handlers
- Groq API inline call
- File export logic
- Server start
- Shutdown handler setup

**Рекомендація:** виділи routes в `routes/items.js`, `routes/sync.js`. Залиши в `server.js` тільки Express setup і middleware.

---

### Проблема 11: Немає тестів для `reddit.test.js` та `djinni.test.js`

```
__tests__/sources/
  hn.test.js      — 246 рядків (детальний)
  reddit.test.js  — 975 байт  (мінімальний)
  djinni.test.js  — 1214 байт (мінімальний)
```

HN має повноцінні тести. Reddit і Djinni — заглушки. Coverage показує `reddit.js` 94.28% і `djinni.js` 95.55% — але це через `istanbul ignore`, а не через реальне тестування.

---

## 📊 Підсумок

| Аспект | Оцінка | Коментар |
|--------|--------|----------|
| Архітектура | 🟢 Відмінно | Ізоляція, registry pattern, IR формат |
| Тести | 🟢 Відмінно | 116 тестів, 99%+ coverage |
| Error handling | 🟢 Відмінно | AppError, retry, failure isolation |
| Database | 🟢 Відмінно | WAL, migrations, fingerprint dedup |
| Frontend | 🟢 Добре | Функціональний, гарний dark mode UI |
| Security | 🟢 Добре | Helmet, CORS, rate limiting, XSS protection |
| DevOps | 🟢 Добре | Docker multi-stage, healthcheck |
| Code duplication | 🟡 Покращити | Groq call дублюється в server.js |
| Dead code | 🟡 Покращити | 45 рядків закоментовано в scheduler |
| server.js size | 🟡 Покращити | 329 рядків, потрібен split |
| Source tests | 🟡 Покращити | Reddit/Djinni тести мінімальні |
| Istanbul ignores | 🟡 Покращити | 15+ ignore для метрики |

---

## Фінальний вердикт

**Проект v4 зроблений на 90%.** Те що є — написано добре. Основні acceptance criteria з плану виконані. Архітектурні рішення (IR формат, registry pattern, ізольований SearchEngine) — правильні і чисто реалізовані.

Головне що залишилось:
1. Прибрати дублювання Groq call
2. Видалити мертвий код
3. Вирішити з scheduler (вмикати чи ні)
4. Дописати тести для Reddit і Djinni sources
5. Split server.js

Після цього — v4 ready. І тоді можна обговорювати v5/v6 з позиції працюючого продукту, а не теоретичного плану.
