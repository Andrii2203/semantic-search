# Universal Matching Engine

You write, in plain text, what you care about. After that you stop searching. The engine keeps
pulling content from sources, or from your own uploaded documents, and delivers only what matches
that intent into an inbox. Every action you take on a result, star, approve or skip, moves your
profile a little, so the next delivery is closer to what you meant.

New here, or an AI agent picking up this repository: read `CLAUDE.md` first. It is the entry point
and it points at everything else.

## How it works

```
sources                     engine                        you
HN, Reddit, Djinni  ──▶  pre-filter, dedup           ──▶  inbox
uploaded PDFs            chunk, embed once                reading pane
                         BM25 + cosine, RRF, MMR          star / approve / skip
                         optional Groq: HyDE, rerank      profile shifts
```

- Content is stored and embedded once, globally. Personal relevance lives in `user_matches`, so
  adding a user does not multiply the embedding cost.
- Search fuses a keyword ranking (SQLite FTS5, BM25) with a semantic ranking (MiniLM embeddings,
  cosine) using Reciprocal Rank Fusion, then applies MMR so the results are not five copies of one
  story.
- Everything that costs money is opt in and off by default. Without a Groq key the system still
  fetches, indexes, searches and ranks.

## Run it

Requirements: Docker, or Node 18 and up.

```bash
cp .env.example .env
# set SESSION_SECRET, and GROQ_API_KEY if you want the AI features
```

With Docker, development, hot reload for both sides:

```bash
docker compose up --build
# api  http://localhost:3000
# ui   http://localhost:5173
```

With Docker, production image, the one that gets deployed:

```bash
docker compose -f docker-compose.yml up --build
# app on http://localhost:3000, UI served from the same port
```

Without Docker:

```bash
npm install
npm run dev
cd client && npm install && npm run dev
```

Open the UI, register an account, and the inbox fills on the next cycle. Registration is required:
the corpus is shared, but items, files and matches are per user.

## Verify it

One command, the same one CI runs:

```bash
npm run verify
```

It runs lint, the complexity limits from `docs/standards/COMPLEXITY.md`, the whole test suite and
the coverage threshold. Nothing is considered done until this is green.

## Configuration

Everything is environment based, see `.env.example` for the full list. The essentials:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/app.db` | SQLite file |
| `SESSION_SECRET` | none in production | Signs session cookies. The server refuses to start in production while this is the default |
| `GROQ_API_KEY` | empty | Enables the paid features. Without it the system runs degraded, and says so on `/api/health` |
| `SIMILARITY_THRESHOLD` | `0.35` | Minimum cosine score for a match |
| `SOURCE_TIMEOUT_MS` | `10000` | Timeout on every outbound source request |
| `CRON_SCHEDULE` | `*/30 * * * *` | Ingest interval |
| `UPLOAD_MAX_FILES` | `200` | Files per upload request |

Most search and scheduler settings can also be changed at runtime in the Settings page, which writes
to the `settings` table and takes effect without a restart.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Module status, also the container health check |
| `GET` | `/api/health/full` | Detailed per module report |
| `POST` | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Accounts |
| `GET` | `/api/items` | Inbox, cursor paginated |
| `POST` | `/api/items/:id/star`, `/approve`, `/skip` | Status, and the feedback signal |
| `POST` | `/api/items/:id/generate` | AI comment for an item |
| `DELETE` | `/api/items/:id` | Remove an item and its chunks |
| `POST` | `/api/search` | Hybrid search, accepts `useHyde`, `useReranker`, `collectionId` |
| `POST` | `/api/search/explain` | Why this matched |
| `POST` | `/api/profiles` | Save an intent from free text |
| `POST` | `/api/upload` | Add PDFs to your library |
| `POST` | `/api/sync` | Run an ingest cycle now |
| `GET`, `POST` | `/api/settings` | Runtime settings |

Everything except `/api/health`, `/api/auth/*` and `/api/client-error` requires a session cookie.

## Layout

| Path | Contents |
|---|---|
| `CLAUDE.md` | Entry point for any agent or contributor |
| `docs/standards/` | How work is done here: workflow, testing, decisions, template, style, complexity |
| `docs/product/` | Vision and strategy |
| `docs/plans/` | The active execution plan |
| `docs/adr/` | One decision per file |
| `docs/reference/` | Module level descriptions |
| `docs/archive/` | Superseded material, kept for history, never a source of truth |
| `src/` | Express, SQLite, scheduler, search engine, parsers |
| `client/` | React UI |
| `__tests__/` | Tests, mirroring `src/` |

## Working on it

The order is fixed and not negotiable: document, then tests, then code until the tests pass. Tests
are never adjusted to match code that already exists. The reasoning and the full rules are in
`docs/standards/WORKFLOW.md` and `docs/standards/TESTING_STANDARD.md`.

## License

MIT
