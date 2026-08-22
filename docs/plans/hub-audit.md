# The Hub audit

Status: active
Owner: repository owner
Last change: 2026-08-22 19:30:36 +0200
Supersedes: none

## 1. Problem

`docs/plans/finance-vertical.md` makes `News-Intelligence-Hub` the single product and builds six
phases on top of it. Nothing had been verified about it. The plan's own words for phase 0: nothing
can be built on it until its state is known rather than assumed.

Three things were unknown. Whether the stack boots at all on a machine that is not the one it was
written on. Which of the six recommendations of its review are still open in the code. What is broken
that the review did not name.

## 2. Decision

This document records a measurement. The decision it serves is phase 0 of
`docs/plans/finance-vertical.md` section 4.

Proof of need: `docs/plans/finance-vertical.md` section 4, phase 0.

## 3. Scope

In scope:
- One cold boot of the full stack from a clean volume, on the owner's machine.
- One live cycle: register, confirm, log in, add a feed, pull it, read the articles back.
- The state of each of the six recommendations, read in the code and checked against the running
  system where a check was possible.
- Defects found during the boot that the review did not name.

Out of scope:
- Fixing anything. This document records state. Each fix carries its own document.
- The language model path, because no key was configured. See section 4, row LLM.
- The frontend beyond the fact that it serves. No screen was driven.

## 4. What was measured

Boot at 2026-08-22 19:27:33 +0200, `docker compose up -d --build`, from no images and no volume.
Docker 29.6.2, Compose v5.3.1. Four images built, exit code 0, no intervention.

| Service | State |
|---|---|
| postgres | up, healthy |
| redis | up, healthy |
| init | exited 0, migrations applied |
| backend | up, healthy after 27 seconds |
| worker | up, two replicas |
| bull-board | up, 401 without credentials, which is correct |
| frontend | up, serves 200 on 8080 |

The whole stack boots on a machine it had never run on, with no manual step beyond writing `.env`
from `.env.example`. That is the strongest single fact in this document.

Live cycle, same session:

| Step | Result |
|---|---|
| `POST /api/auth/register` | 201, dev confirm link returned in the body |
| `GET /api/auth/confirm` | `{"confirmed":true}` |
| `POST /api/auth/login` | access token, 203 characters |
| `POST /api/feeds` | Ars Technica feed accepted, title read from the feed itself |
| `POST /api/feeds/:id/pull` | job scheduled |
| `GET /api/articles` | 20 articles with real titles and publication dates |
| LLM analysis | all 20 rows at status `error`, cause `401 API key is invalid` |

The LLM row is not a defect. The key in `.env` is a placeholder. What it does prove is that
everything before the language model works: fetch, parse, deduplicate, store, enqueue.

## 4.1 The six recommendations

Source: `News-Intelligence-Hub/docs/проeктNewsIntelligenceHub.md` section 07, read 2026-08-22
19:10 +0200.

| # | Recommendation | State | Evidence |
|---|---|---|---|
| 1 | Article similarity off the request hot path | open, and wider than described | `backend/src/articles/articles.service.ts:118` builds the whole index per request, `:289` compares every article against every other |
| 2 | Semantic similarity on embeddings instead of entity overlap | open | no vector column, no pgvector extension in the migrations |
| 3 | No baked URLs and ports | half closed | the confirm link is runtime, `backend/src/auth/auth.service.ts:149`. The Bull Board URL is a build argument, `frontend/Dockerfile:6`, and changing it needs a rebuild |
| 4 | Real logout | open, and confirmed live | `backend/src/auth/auth.controller.ts:83` returns a message and nothing else. The same token returned 200 on `/api/feeds` after logout |
| 5 | Filter state in the URL, date component | not checked, no screen was driven | |
| 6 | Bull Board locale, tab titles | not checked, same reason | |

Recommendations 1 and 2 are phase 3 of `docs/plans/finance-vertical.md`. That the reviewer and the
plan arrived at the same two items independently is worth recording.

## 4.2 What the review did not name

One defect, found because two workers ran at once.

`backend/src/workers/feed-pull.worker.ts:186` reads `articleProcessing` by its unique key, and
`:192` creates the row if the read returned nothing. There is no transaction between the two. With
`WORKER_REPLICAS` at 2, a manual pull that lands on the same feed as the scheduled pull makes both
replicas pass the read and both attempt the create. One wins, the other throws
`Unique constraint failed on the fields: (userId, articleId)`, and the whole feed pull job fails,
abandoning every item after the collision.

It happened on the first pull of this audit, at 2026-08-22 19:29:35 +0200, twice, once for the
scheduled job and once for the manual one. It is a two line fix, an upsert or a catch on P2002, and
it belongs to whichever phase touches ingest.

Second, smaller. `backend/src/llm/llm.service.ts:171` tries each provider in turn and overwrites
`lastError` each time, so when both fail only the second failure is ever seen. The logs above name
Anthropic while `LLM_PROVIDER` was set to openai, and that reads like a configuration defect until
the fallback is understood. It is not a defect, it is an observability one.

## 5. Behaviours

Not applicable. This document records a measurement and changes no behaviour. The behaviours belong
to the documents that fix what is listed here.

## 6. Tests

Not applicable, for the reason in section 5.

The Hub's own suite as found: seven unit specs under `backend/src`, one integration spec under
`backend/tests`, none in the frontend. It does not follow `docs/standards/TESTING_STANDARD.md`
section 5. Whether it adopts that standard is the open question in section 8.

## 7. Definition of done

- The stack boots from clean and every service reaches its own healthy state. Done, section 4.
- Each of the six recommendations carries a state and its evidence. Done for four, section 4.1. Two
  need a screen driven and say so.
- Anything found that the review did not name is written down. Done, section 4.2.

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the Hub adopts `docs/standards/TESTING_STANDARD.md` section 5 and the document template | Before the first document written inside the Hub, which is the next fix |
| Which repository owns these documents once the Hub is the trunk | Phase 3, unchanged from `docs/plans/finance-vertical.md` section 10 |
| Whether recommendations 5 and 6 are open | A session that drives the frontend screens |
| Whether `WORKER_REPLICAS` stays at 2 before the race in section 4.2 is fixed | The next live cycle, because the defect fires on any concurrent pull |

Answered by this audit, and closed in `docs/plans/finance-vertical.md` section 10: the Hub lives at
`github.com/Andrii2203/News-Intelligence-Hub`, it keeps its own git history, and the working copy is
attached to it.
