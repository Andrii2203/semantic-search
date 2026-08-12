### 6. Djinni scraping — що це і як виправити

**Що це:** Ти парсиш HTML сторінку Djinni через `html.split('class="job-item ')`. Це працює ТІЛЬКИ поки Djinni використовує саме цей CSS клас. Якщо вони завтра змінять `job-item` на `vacancy-card` — твій парсер повертає 0 результатів без жодної помилки.

**Як виправити — два варіанти:**

**Варіант А (простий):** Додай перевірку після парсингу:
```javascript
const jobs = parseJobs(html);
if (jobs.length === 0 && html.length > 1000) {
  logger.warn('Djinni: HTML отримано але 0 вакансій — можливо змінилась верстка');
}
```

**Варіант Б (надійний):** Використай бібліотеку `cheerio` (jQuery для серверу). Вона парсить HTML як DOM, і ти шукаєш по селекторах:
```javascript
const cheerio = require('cheerio');
const $ = cheerio.load(html);
$('.job-item').each((i, el) => {
  const title = $(el).find('.job-item__header-link').text();
  const url = $(el).find('a').attr('href');
  // ...
});
```

Cheerio стабільніший ніж `string.split`, але все одно зламається при зміні верстки — це природа scraping.

---

### 7. Istanbul ignore — як зробити краще

**Проблема:** CI вимагає >80% coverage. Ти додаєш `istanbul ignore` щоб пройти поріг.

**Краще рішення — тестуй те що ігноруєш:**

Більшість твоїх `istanbul ignore` — на коді який **можна тестувати**. Наприклад:

```javascript
// db.js:86
/* istanbul ignore next */
const applied = new Set(
  db.prepare('SELECT name FROM migrations').all().map((r) => r.name),
);
```

Цей рядок виконується при `db.init(':memory:')` → він вже покритий тестом `db.test.js` при `beforeEach`. Ignore тут просто не потрібен — видали його і coverage не зміниться.

Ось де ignore **виправданий** і його можна лишити:
- `getModel()` — lazy loading ML моделі (неможливо тестувати без 400MB download)
- `generateEmbedding()` — залежить від ML моделі
- `createShutdownHandler()` — process signals складно тестувати

Ось де ignore **не потрібен** — код уже покритий або легко покрити:
- `db.js:86` — вже виконується в тестах
- `config.js` — env() функції
- `retry.js:14-15` — можна покрити тестом

**Дія:** Пройдись по кожному ignore, видали ті які не потрібні. Реальне число має бути 4-5, не 15.

---

### 13. Фронтенд фреймворк для v5

Ось головні варіанти:

| Фреймворк | Плюси | Мінуси | Для тебе? |
|-----------|-------|--------|-----------|
| **React** | Найбільша екосистема, найбільше вакансій, купа бібліотек | Потрібен bundler (Vite), більше boilerplate | ✅ Якщо хочеш показати на портфоліо |
| **Next.js** | React + SSR + routing + API routes з коробки | Overkill для SPA без SEO, тягне свій сервер | ❌ У тебе вже є Express backend |
| **Vue 3** | Простіший за React, SFC (все в одному файлі), чудова документація | Менше вакансій ніж React | ✅ Якщо хочеш швидше зробити |
| **Svelte** | Найшвидший, найменше коду, компілюється в vanilla JS | Маленька екосистема, менше бібліотек | 🟡 Для нових проектів — відмінно |
| **React + Vite** | React швидкість + Vite DX | Два інструменти | ✅ Найкращий компроміс |

**Моя рекомендація: React + Vite**

Причини:
1. У тебе вже є Express backend → тобі потрібен тільки frontend SPA, не full-stack фреймворк
2. React — найбільше вакансій, це додає цінності в портфоліо
3. Vite — моментальний dev server, HMR, простий конфіг
4. Shadcn/ui або Radix — готові компоненти для UI яке ти хочеш побудувати
5. `npx create-vite@latest ./frontend --template react` — готово за 30 секунд

Next.js тобі **не потрібен** — у тебе вже є свій Express сервер з API. Next.js додає свій сервер поверх, це зайва складність.