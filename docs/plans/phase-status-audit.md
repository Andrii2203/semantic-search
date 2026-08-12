# Phase status audit

Status: active
Owner: repository owner
Last change: 2026-08-12
Supersedes: none

## 1. Problem

The plan in `PLAN_v7.md` says phases 1, 2 and 2.5 are done and marks the rest as upcoming. The plan
was written before the work, so it records intent, not result. After a break from the project nobody
can say which phase is actually closed, and a plan that is trusted while being wrong is worse than no
plan.

This document records what the code does, phase by phase, checked against each Definition of Done
line rather than against memory. Every verdict below carries the file that proves it.

## 2. Decision

Phases are closed in order, earliest first. Each open phase gets its remaining behaviours listed here
in section 4, and those lines are the ones that turn into tests, per `../standards/WORKFLOW.md`.

Proof of need: not applicable, this is a survey of existing work rather than a new feature.

## 3. Verdicts

| Phase | Verdict | Proof |
|---|---|---|
| 1. Fix the gap | closed | `src/startup.js` five checks, `src/routes/health.js`, `src/scheduler.js` builds chunks and vectors, migration 007 adds `collection_id`. A live cycle stored 75 items and 75 chunks |
| 2. Gmail layout and multi user auth | closed | `client/src/components/Sidebar.jsx` collapsible with sync, `ItemList.jsx` shows title, source, score, author and relative time, `ReadingPane.jsx` carries generate, copy, approve, skip, star, delete and why, cursor pagination in `src/routes/items.js`, auth with bcrypt and a signed cookie in `src/middleware/auth.js`, isolation covered by `__tests__/middleware/auth.test.js` |
| 2.5 Profile, search quality, AI toggles | closed | RRF and MMR in `src/search-engine.js`, `user_matches` in migration 011, feedback weights in `src/feedback.js` wired from `src/routes/items.js`, HyDE in `src/hyde.js`. The search screen sends the HyDE flag, offers rerank and shows per item ranking numbers, covered by `client/src/components/ItemList.test.jsx` |
| 2.6 Consistency and onboarding | closed | `src/routes/items.js` counts only the internet collection, `db.seedWelcomeForUser` called on register |
| 3. Settings, health, AI enhancements | closed for what was proved needed | Settings table in migration 013 with routes, validation and a set only API key, `config.live`, `src/health-checker.js` with a 30 second cache, `/api/health/full`, `SystemHealth.jsx`, `AlertBanner.jsx`, four business events. `scheduler.applySchedule` makes the cron controls real, covered by `__tests__/routes/sync-status.test.js`. The rest is deferred, see section 4 |
| 4A Files mode | closed | `src/routes/upload.js` tags every upload with a batch id, `FilesMode.jsx` matches against the whole library or the last batch, uploads one file per request and reports progress, covered by `client/src/components/FilesMode.test.jsx` and `__tests__/api.upload.test.js` |
| 4B Dynamic sources | not started | No `user_sources` table, no RSS adapter, sources are still the three built in modules |
| 5. Polish | backlog | Only the theme switch exists, and it arrived with phase 2 |

## 4. Behaviours that remain

### Closed since this audit was written

Behaviours 1 to 9 are built and covered, so they live in git history rather than here: commit
`40a49d1` for the search interface, `8534267` for the cron controls and the health footer, and the
commit carrying this edit for upload progress.

### Deferred, with the reason

Recorded in `PLAN_v7.md` and not counted as gaps: durable error history, importance classification at
ingest, contextual chunking. Deferred here for the same reason, no trigger has occurred: per source
configuration in the interface (subreddits, keywords, limits), the prompt editor, and a test
connection button per module.

### Not measured

Benchmarks for 5, 50 and 100 files are listed in the plan as done, but no numbers were ever recorded.
`scripts/bench-upload.js` exists to produce them. Uploads now go one file per request, so the
measurement to take is time per file and peak memory across a batch.

### Phase 4B

Not started, and not opened here. It needs its own plan, starting with the RSS adapter, which the
plan itself calls the highest return of the four source levels.

## 5. Tests

The client had no tests when this audit was written, and that absence was the finding: 496 server
tests could not see four interface defects. `../adr/005-client-test-runner.md` carries the decision
that followed. The client now runs on Vitest with Testing Library, from the same `npm run verify`,
covering the search controls, the health footer and the upload batch.

## 6. Definition of done

- Every phase above is either closed, or has its remaining behaviours written down here.
- A phase is only called closed when its proof column names code that exists.
- When a behaviour in section 4 is built, it moves out of this document and into git history.

## 7. Rollback

Not applicable. This document changes no runtime behaviour.

## 8. Open questions

- Client tests need a decision: a test runner for React, or accept that the interface is verified by
  hand. This should run through the decision protocol before phase 5 adds more interface.
