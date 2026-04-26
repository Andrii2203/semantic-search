```markdown
# React Frontend — Semantic Search UI

Експериментальний фронтенд для візуалізації результатів семантичного пошуку. Побудований на React + Vite + Tailwind CSS.

## ⚠️ Статус

Ця гілка — **пісочниця для UI-експериментів**. Жоден код із цієї гілки не потрапляє в production без окремого рев'ю.

## 🚀 Швидкий старт

```bash
# Встановити залежності
npm install

# Запустити dev-сервер
npm run dev
```

Відкрити http://localhost:5173

## 📦 Стек

| Технологія | Призначення |
|---|---|
| React 19 | UI-бібліотека |
| Vite | Збірка |
| Tailwind CSS v4 | Стилізація |
| @vitejs/plugin-react-swc | Швидка компіляція JSX |

## 📂 Структура

```
/frontend
  /src
    App.jsx              — головний компонент
    main.jsx             — точка входу
    index.css            — глобальні стилі + Tailwind
    /components
      Header.jsx         — навігація
      SearchCard.jsx     — картка пошуку
      DebugLogger.jsx    — технічна панель
    /hooks
      useLivingDesign.js — жива анімація (експеримент)
  /public
    index.html
  vite.config.js
  package.json
```

## 🧪 Експериментальні фічі

- **Living Design System** — фон реагує на час доби, день року та погоду
- **Orbital Glow** — декоративна куля, що рухається по орбіті протягом року
- **DebugLogger** — технічна панель для перевірки стану системи

## 🔗 Пов'язані гілки

| Гілка | Опис |
|---|---|
| `main` | Стабільний бекенд (Express + SQLite) |
| `feature/react-frontend` | Ця гілка — UI-експерименти |
| `pdf-parser-module` | Модуль парсингу PDF-резюме |

## 📝 Нотатки

- Tailwind v4 використовує `@theme` замість `tailwind.config.js`
- Анімації не впливають на продуктивність пошуку
- Компоненти не залежать від бекенду — можна розробляти окремо
```