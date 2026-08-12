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
| 2.5 Profile, search quality, AI toggles | backend closed, interface open | RRF and MMR in `src/search-engine.js`, `user_matches` in migration 011, feedback weights in `src/feedback.js` wired from `src/routes/items.js`, HyDE in `src/hyde.js` and the search route. The interface does not reach any of it, see section 4 |
| 2.6 Consistency and onboarding | closed | `src/routes/items.js` counts only the internet collection, `db.seedWelcomeForUser` called on register |
| 3. Settings, health, AI enhancements | partly open | Settings table in migration 013 with routes, validation and a set only API key, `config.live`, `src/health-checker.js` with a 30 second cache, `/api/health/full`, `SystemHealth.jsx`, `AlertBanner.jsx`, four business events. Gaps in section 4 |
| 4A Files mode | closed | `src/routes/upload.js` tags every upload with a batch id, `FilesMode.jsx` matches against the whole library or the last batch, rerank behind the AI switch, isolation covered by `__tests__/api.upload.test.js` |
| 4B Dynamic sources | not started | No `user_sources` table, no RSS adapter, sources are still the three built in modules |
| 5. Polish | backlog | Only the theme switch exists, and it arrived with phase 2 |

## 4. Behaviours that remain

### Phase 2.5, interface

The search screen sends only the query and the collection, so three paid or diagnostic features that
the server already supports are unreachable, and one store is dead code.

1. The search request carries the HyDE flag when the user turns HyDE on for that search.
2. The search screen offers a rerank action on a finished result set, and the reranked order replaces
   the shown order.
3. Every result can show its own bm25 rank, semantic rank and fused score, behind one toggle that is
   off by default.
4. Every control that spends money is disabled, with a reason, when no Groq key is configured.
5. `client/src/stores/searchStore.js` is either used by the search screen or deleted.

### Phase 3, settings and health

6. Turning the scheduler off in Settings stops the ingest cycle from running on the cron.
7. Changing the cron expression in Settings changes when the next cycle runs, without a restart.
8. Hovering a module in the health footer names the module and its last error.

Deferred with a recorded reason in `PLAN_v7.md`, not counted as gaps: durable error history,
importance classification at ingest, contextual chunking. Deferred here for the same reason, no
trigger has occurred: per source configuration in the interface (subreddits, keywords, limits), the
prompt editor, and a test connection button per module.

### Phase 4A, measurement

9. Upload reports progress while a batch is processed, rather than a single pending state.

Benchmarks for 5, 50 and 100 files are listed in the plan as done but no numbers were ever recorded.
`scripts/bench-upload.js` exists to produce them.

### Phase 4B

Not started, and not opened here. It needs its own plan, starting with the RSS adapter, which the
plan itself calls the highest return of the four source levels.

## 5. Tests

Each numbered behaviour gets its test when it is built, following `../standards/TESTING_STANDARD.md`.
Levels are decided at that point, though behaviours 6 and 7 are level 2 against the scheduler, and 1
to 5 and 9 are interface behaviours that the current suite does not cover at all, since there are no
client tests in this repository.

That absence is itself a finding: 496 tests cover the server and none cover the client, so every
interface gap in section 4 was invisible to the suite.

## 6. Definition of done

- Every phase above is either closed, or has its remaining behaviours written down here.
- A phase is only called closed when its proof column names code that exists.
- When a behaviour in section 4 is built, it moves out of this document and into git history.

## 7. Rollback

Not applicable. This document changes no runtime behaviour.

## 8. Open questions

- Client tests need a decision: a test runner for React, or accept that the interface is verified by
  hand. This should run through the decision protocol before phase 5 adds more interface.
