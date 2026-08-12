# Production readiness fixes

Status: active
Owner: repository owner
Last change: 2026-08-12
Supersedes: docs/archive/reviews/tech_debt_audit.md

## 1. Problem

The system was verified by running it in Docker on 2026-08-12. The application logic works: the model
loads, all three sources answer, the pre filter drops 120 of 194 items, the auth guard returns 401,
the React client serves. Everything that fails is in the layer between working code and a running
product.

Observed, not predicted:

- The production image cannot start. Its entry command is `dumb-init`, which is never installed.
  This is hidden in development because the compose override replaces the command.
- The container reports `unhealthy` while the application is healthy. The health check calls `wget`,
  which does not exist in `node:20-slim`. Every check has failed since the image was built.
- With no registered users the ingest cycle discards everything it fetched. 194 items were fetched,
  74 passed the filter, and none were stored, because corpus building is inside the per user branch.
- Six tests fail, so `npm test` is red and CI is red. A fake for `pdf-parse` was left on the version 1
  function API after the code moved to the version 2 class API.
- Upload holds every file in memory: 200 files at 10 MB is 2 GB of resident memory per request.
- Shutdown closes the database before in flight requests finish, then waits a fixed five seconds
  whether or not anything is running, and does not look at the scheduler at all.
- No outbound HTTP call has a timeout. One source that accepts a connection and never answers stops
  the ingest cycle for good.
- The Djinni parser splits raw HTML on a class name. When the markup changes it returns zero jobs and
  reports success.
- `SESSION_SECRET` defaults to `change-me-in-production` and appears in neither `.env.example` nor the
  compose file, so a deployment signs sessions with a value published in the source.
- `.env.example` ships `CRON_SCHEDULE=0 0 31 2 *`, the 31st of February, so a fresh install never
  fetches anything.

## 2. Decision

Fix all of it in one pass, defect by defect, each with a test that fails first. No feature work, no
refactoring beyond what the complexity limits require on the files being touched.

Proof of need: every item above is a reproduced failure, so the decision protocol does not apply,
per its section 2. The two exceptions that add rather than fix are recorded in section 8.

## 3. Scope

In scope:
- The eleven defects listed in section 1.
- Removal of code proven dead: `findRelevant` in the search engine, and the legacy `public/` client.
- The complexity limits from `COMPLEXITY.md`, applied to every file this change touches.

Out of scope:
- Rewriting the Djinni parser on a DOM library. The guard in behaviour 8 turns a silent zero into a
  loud one, which is the part that matters. A parser rewrite is fragile against the same markup
  change and is deferred with its trigger in section 8.
- Splitting the whole catch all test file. Only the part that broke moves out now, see behaviour 1.
- Any change to search ranking, the profile model or the UI.

## 4. Behaviours

1. One fake for `pdf-parse` exists, it implements the version 2 class API, and no test file defines
   its own.
2. The production image starts with no init binary that is not installed in it.
3. The container health check reports healthy while `/api/health` answers, using only the Node
   runtime that is already in the image.
4. Upload writes each incoming file to disk, not to memory.
5. Upload deletes every temporary file it wrote, including when parsing throws.
6. Every outbound source request aborts after the configured timeout and is reported as a source
   failure, while the other sources still return their items.
7. The ingest cycle stores items and chunks when there are no registered users, and creates no user
   matches.
8. The Djinni source reports a layout change when the response body has content but yields no jobs.
9. Shutdown closes the database only after the HTTP server has stopped accepting connections.
10. Shutdown waits while an ingest cycle is running, and exits immediately when nothing is running.
11. The server refuses to start in production when the session secret is still the default.
12. The example environment file carries a cron expression that fires.
13. The search engine exposes no unused embedding path.
14. The export file path comes from configuration, so two test files never write to the same file
    and a deployment can place it outside the source tree.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L4 | `__tests__/parsers/pdf-extractor.test.js`, `__tests__/parsers/parse-resume.test.js` |
| 2 | manual | Docker, `docker compose -f docker-compose.yml up` |
| 3 | manual | Docker, `docker inspect` health status |
| 4 | L3 | `__tests__/api.upload.test.js` |
| 5 | L3 | `__tests__/api.upload.test.js` |
| 6 | L4 | `__tests__/sources/fetch-timeout.test.js` |
| 7 | L2 | `__tests__/scheduler.test.js` |
| 8 | L4 | `__tests__/sources/djinni.test.js` |
| 9 | L2 | `__tests__/shutdown.test.js` |
| 10 | L2 | `__tests__/shutdown.test.js` |
| 11 | L2 | `__tests__/startup.test.js` |
| 12 | L1 | `__tests__/config.test.js` |
| 13 | L1 | `__tests__/search-engine.test.js` |
| 14 | L3 | `__tests__/api.test.js`, `__tests__/integration-tests-uncovered.test.js` |

Behaviours 2 and 3 have no automated test on purpose. They are properties of the image, and the only
honest check is starting the image. Both are listed in section 6 as manual steps with their exact
commands.

## 6. Definition of done

- `npm run verify` is green: lint, complexity limits, all tests, coverage at or above 80 percent.
- `docker compose -f docker-compose.yml up` starts the production image, with no override file.
- `docker inspect --format '{{.State.Health.Status}}' semantic-search` prints `healthy`.
- A cycle with zero registered users leaves rows in `items` and `chunks`, and none in `user_matches`.
- `git grep -n "memoryStorage"` returns nothing.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| Disk storage breaks upload on the host | Set `UPLOAD_MAX_FILES=20` and revert `upload.js` to the previous commit | 10 min |
| The new shutdown hangs on exit | Restore the fixed five second timer as an outer bound | 5 min |
| The fetch timeout is too aggressive for a slow source | Raise `SOURCE_TIMEOUT_MS`, it is configuration | 1 min |
| The production session secret check blocks a deploy | Set `SESSION_SECRET` in the environment, which is the point of the check | 1 min |

## 8. Open questions

- Djinni on a DOM library. Deferred. Trigger: the guard from behaviour 8 fires twice in one week, or
  the source is needed for a paying user.
- Splitting `__tests__/integration-tests-uncovered.test.js` completely. Deferred. Trigger: the next
  change that touches any area it covers moves that area out first, per `COMPLEXITY.md` section 5.
- Worker thread for embedding during upload. Deferred. Trigger: a measured upload that blocks the
  event loop for more than 60 seconds.
