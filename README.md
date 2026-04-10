# Semantic Search Engine

A universal semantic search engine that connects to any data source through a unified interface, filters by meaning using embeddings (not keywords), and dispatches type-specific actions — all through a production-ready Node.js runtime.

## Overview

The engine uses a pluggable architecture:

- **Sources** fetch data from external APIs (Hacker News, Reddit, Dev.to, Djinni) and normalize it into a unified **IR (Intermediate Representation)** format.
- **SearchEngine** filters items by semantic similarity against an active **Profile** vector using cosine similarity on embeddings.
- **Action Dispatcher** routes filtered items to the correct generator (comments, cover letters, code refactoring) based on type.
- **Dashboard UI** displays results in a browser for manual approval and action.

## Install

```bash
# Clone and enter directory
cd semantic-search

# Install dependencies (requires Node.js >= 18)
npm install

# Copy env template and configure
cp .env.example .env
# Edit .env — at minimum set GROQ_API_KEY
```

## Configuration

All configuration is environment-based. See `.env.example` for the full list:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | `development` or `production` |
| `DB_PATH` | `./data/app.db` | SQLite database path |
| `GROQ_API_KEY` | — | Groq API key (required for LLM) |
| `ACTIVE_PROFILE` | `content` | Active search profile |
| `SIMILARITY_THRESHOLD` | `0.65` | Min cosine similarity (0–1) |
| `CRON_SCHEDULE` | `*/30 * * * *` | Scheduler interval |
| `LOG_LEVEL` | `info` | Pino log level |

## Run

```bash
# Development (auto-restart on changes)
npm run dev

# Production
NODE_ENV=production npm start
```

Open `http://localhost:3000` in your browser.

## Test

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

## Architecture

```
┌──────────┐     ┌────────────┐     ┌──────────────┐     ┌────────────┐
│  Sources  │────▶│ SearchEngine│────▶│  Dispatcher   │────▶│   DB/UI    │
│ (fetch)   │     │ (filter)    │     │  (actions)    │     │ (display)  │
└──────────┘     └────────────┘     └──────────────┘     └────────────┘
     │                  │                   │
     ▼                  ▼                   ▼
  IR format        Embeddings +        Type → Action
  (unified)        cosine sim         (generate-comment,
                                       generate-cover)
```

### Key Concepts

- **IR (Intermediate Representation)** — unified data format with `id`, `content`, `type`, `source`, `metadata`
- **Profile** — pre-computed embedding vector representing what you're searching for
- **Action** — a handler that generates a response for a specific item type
- **Source** — a module that fetches and normalizes data from an external API

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/items?status=new` | List items by status |
| `POST` | `/api/items/:id/approve` | Approve an item |
| `POST` | `/api/items/:id/skip` | Skip an item |

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start dev server with auto-reload |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint source code |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format code with Prettier |

## License

MIT
