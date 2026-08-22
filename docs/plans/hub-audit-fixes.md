# The Hub audit fixes

Status: active
Owner: repository owner
Last change: 2026-08-22 19:44:16 +0200
Supersedes: none

## 1. Problem

`docs/plans/hub-audit.md` found four things wrong in the running Hub. Three of them are defects, one
is an obstacle to running the product anywhere but this machine.

Articles are lost silently. Two worker replicas pull the same feed at once, both read
`articleProcessing` and find nothing, both create the row, one wins and the other throws
`Unique constraint failed on the fields: (userId, articleId)`. The whole feed pull job fails, and
every item after the collision is never stored. Observed twice on the first pull of the audit, at
2026-08-22 19:29:35 +0200.

Logging out does nothing. `POST /api/auth/logout` returns a message and the token keeps working for
the remaining seven days. Measured in the audit: the same token returned 200 on `/api/feeds` after
logout.

The queue link is compiled into the bundle. `VITE_BULL_BOARD_URL` is a build argument, so pointing
the product at a different host means rebuilding the frontend image.

When both language model providers fail, only the second failure is ever reported, because
`lastError` is overwritten in the loop. The audit spent time reading an Anthropic error while the
configuration said openai.

## 2. Decision

The ingest write becomes atomic, logout revokes the token that asked for it, the queue link is read
at runtime from the backend rather than compiled into the frontend, and a failure of every provider
reports every failure.

Proof of need: `docs/plans/hub-audit.md` sections 4.1 and 4.2. Each item is a defect observed on a
running system, which is `docs/standards/DECISION_PROTOCOL.md` question 1 answered by a trigger that
already happened.

## 3. Scope

In scope:
- `linkProcessing` in the feed pull worker.
- Token revocation on logout, per token rather than per user.
- A public `GET /api/config` that carries the queue link, and the frontend reading it.
- The error raised when every language model provider fails.

Out of scope:
- Recommendations 1 and 2 of the review, article similarity and embeddings, because they are phase 3
  of `docs/plans/finance-vertical.md` and carry their own document.
- Recommendations 5 and 6, because `docs/plans/hub-audit.md` could not check them without driving
  the screens.
- Refresh tokens with rotation. The reviewer offered it as an alternative to a denylist, and the
  denylist is the smaller change against a product that has no refresh flow today.

## 4. Behaviours

1. The feed pull worker stores one processing row when two workers pull the same feed at the same
   moment.
2. The feed pull worker stores the remaining items of a feed when one of its items collides.
3. The authenticated routes reject a token with 401 when that token has been used to log out.
4. The authenticated routes accept a token when a different token of the same user has been used to
   log out.
5. The logout record carries the expiry of the token it revokes.
6. `GET /api/config` returns the queue link from the environment it was started with.
7. `GET /api/config` returns a null queue link when the environment names none.
8. The language model service reports the failure of every provider when every provider fails.

## 5. Tests

The Hub keeps its own layout, NestJS co-located `*.spec.ts` beside the source and integration specs
under `backend/tests`. It adopts sections 3 and 5 of `docs/standards/TESTING_STANDARD.md` for the
level definitions and for test names being full sentences. This answers the first open question of
`docs/plans/hub-audit.md` section 8.

| # | Level | File |
|---|---|---|
| 1 | L2 | `backend/tests/feed-pull.integration.spec.ts` |
| 2 | L2 | `backend/tests/feed-pull.integration.spec.ts` |
| 3 | L3 | `backend/tests/logout.integration.spec.ts` |
| 4 | L3 | `backend/tests/logout.integration.spec.ts` |
| 5 | L3 | `backend/tests/logout.integration.spec.ts` |
| 6 | L3 | `backend/tests/config.integration.spec.ts` |
| 7 | L3 | `backend/tests/config.integration.spec.ts` |
| 8 | L1 | `backend/src/llm/llm.service.spec.ts` |

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run lint` and `npm test` are green in `backend`, and `npm run lint` is green in `frontend`.
- The stack boots from clean and the live cycle of `docs/plans/hub-audit.md` section 4 runs again
  with the same result, plus a token that stops working after logout.
- The frontend bundle contains no queue URL. Checked by grepping the built assets.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The denylist lookup slows authenticated requests | The check is one indexed read in `JwtStrategy`. Remove the read, keep the table | 5 minutes |
| The atomic write hides a real duplicate defect | The catch returns false only for P2002 on that unique key. Any other error still throws | not applicable |
| The frontend cannot reach `/api/config` | The link is absent, which is behaviour 7. No screen breaks | not applicable |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether revoked rows are deleted by a scheduled job rather than on write | The table passes a size where the delete on write is measurable |
| Whether `WORKER_REPLICAS` returns above 2 | Behaviours 1 and 2 pass, which removes the reason it was a risk |
| Whether the Hub adopts the rest of `docs/standards/`, beyond the two sections named in section 5 | The first document written inside the Hub |
