# Profile ownership

Status: active
Owner: repository owner
Last change: 2026-08-17 14:39:53 +0200
Supersedes: none

## 1. Problem

Any logged in account can read, use and delete every other account's profile.

This was found on 2026-08-17 14:35:00 +0200 while writing
`docs/adr/019-the-global-active-profile-is-removed.md`. That ADR removes a dead function that read a
profile without an owner, and its first draft claimed the dead function was the only such read in
`src/db.js`. Checking that claim disproved it. Three more unowned reads exist, and unlike the dead one
they are reachable from authenticated endpoints.

The three functions, in `src/db.js`:

| Function | Query | Reached from |
|---|---|---|
| `getAllProfiles` | `SELECT * FROM profiles ORDER BY created_at DESC` | `GET /api/config/profiles` |
| `getProfile` | `SELECT * FROM profiles WHERE id = ?` | `POST /api/search` with a `profileId`, through `ProfileGenerator.loadProfile` |
| `deleteProfile` | `DELETE FROM profiles WHERE id = ?` | `DELETE /api/config/profiles/:id` |

None takes a user identifier. `src/server.js` line 57 applies `requireAuth` to all three routers, and
`requireAuth` in `src/middleware/auth.js` line 92 establishes only that the caller is signed in. There
is no role, no owner check and no admin concept anywhere in the request path.

### 1.1 Measured, not reasoned

Run 2026-08-17 14:37:00 +0200 as a temporary Jest suite against the real Express app over supertest.
Two accounts were registered, `alice@example.com` and `bob@example.com`. Bob saved a profile whose
`rawInput` was the string `BOB PRIVATE INTENT TEXT`. Every request below was sent with Alice's session
cookie. The probe file was deleted after the run and its findings are these three rows.

| Request as Alice | Status | Response |
|---|---|---|
| `GET /api/config/profiles` | 200 | Bob's row in full, including `raw_input: "BOB PRIVATE INTENT TEXT"`, his `keywords`, his `vector` and his `user_id` |
| `POST /api/search` with Bob's `profileId` | 200 | Search ran on Bob's profile and the response echoed `keywords: ["bob-secret-keyword"]` |
| `DELETE /api/config/profiles/<Bob's id>` | 200 | `{"success":true}`. Bob's profile was deleted by Alice |

The profile's `rawInput` is the free text a person writes about what they care about. It is the most
personal field the system stores, and `docs/product/VISION.md` makes it the thing the whole product is
organised around. The search probe leaks the profile rather than the other account's items, because
`src/routes/search.js` passes `req.userId` into the corpus queries, so the item scope is correct even
while the profile scope is not.

### 1.2 Why the suite is green

`__tests__/routes/config-routes.test.js` and `__tests__/routes/search.test.js` both exercise these
paths with one account. One account cannot observe a missing owner check, because with one owner every
row belongs to the caller. `__tests__/user-matches.test.js` is the only suite that registers two
accounts, and it covers items rather than profiles.

This is the same shape as the defects in `docs/reference/system-anatomy.md` section 7.2. The check that
was missing was never written, so nothing failed.

## 2. Decision

Every read, use and delete of a profile carries the identifier of the account making the request, and
the endpoints that cannot be made owner safe are removed rather than filtered.

`GET /api/config/profiles` returns the caller's profiles. It was written when one person ran the system
and reads as an operator view, but there is no operator, so an all accounts listing has no owner it
could belong to.

Proof of need: not applicable. Every row in section 1.1 is a reproduced failure, so
`docs/standards/DECISION_PROTOCOL.md` section 2 excludes this from the protocol.

## 3. Scope

In scope:
- `getProfile`, `getAllProfiles` and `deleteProfile` in `src/db.js`, and the three routes that reach
  them.
- `ProfileGenerator.loadProfile`, which passes a caller supplied identifier straight into `getProfile`.

Out of scope:
- The rest of `src/routes/config-routes.js`, which is chunking configuration and rechunking. It is
  global state rather than per person data, and no measurement says it is wrong.
- `getActiveProfile`, removed by `docs/adr/019-the-global-active-profile-is-removed.md`. It was dead,
  which is why it is a cleanup and this is a defect.
- A role or admin model. Nothing in the product needs one today, and adding one to fix an ownership
  bug would be a new abstraction under `docs/standards/DECISION_PROTOCOL.md` section 2.

## 4. Behaviours

1. `GET /api/config/profiles` returns only profiles whose `user_id` is the caller.
2. `DELETE /api/config/profiles/:id` returns 404 when the profile belongs to another account.
3. `DELETE /api/config/profiles/:id` deletes the profile when it belongs to the caller.
4. `POST /api/search` with a `profileId` belonging to another account returns 404 and runs no search.
5. `POST /api/search` with a `profileId` belonging to the caller returns results.
6. No query in `src/db.js` that reads or deletes a single profile row runs without a user identifier,
   except a lookup that takes the profile identifier and the user identifier together.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L3 | `__tests__/routes/config-routes.test.js` |
| 2 | L3 | `__tests__/routes/config-routes.test.js` |
| 3 | L3 | `__tests__/routes/config-routes.test.js` |
| 4 | L3 | `__tests__/routes/search.test.js` |
| 5 | L3 | `__tests__/routes/search.test.js` |
| 6 | L1 | `__tests__/db.test.js` |

Every test from 1 to 5 registers two accounts and asserts from the second account's view. A test for
this defect written with one account cannot fail, which is how the defect survived, so two accounts is
the requirement rather than a detail.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run verify` is green.
- The probe in section 1.1 is rerun and all three rows return 404 or an empty list.
- No route handler passes a caller supplied identifier into a database function that does not also
  take the caller's user identifier.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| Scoping `GET /api/config/profiles` breaks a screen | The client is a draft and calls this endpoint from nothing today, so the screen is written against the scoped shape instead | 15 minutes |
| The search `profileId` check rejects a legitimate call | It cannot without the caller owning the profile. If it does, the check is wrong and reverts to one commit | 5 minutes |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the same unowned pattern exists for other per person tables | The next audit. `user_sources` and `user_matches` were not checked when this was found, and stating they are safe without running the probe against them would repeat the mistake this document exists to record |
| Whether `GET /api/config/profiles` is kept at all once it returns one row for the caller, given `GET /api/profiles/active` already answers that | The behaviours above are green and the endpoint has no caller in the client |
