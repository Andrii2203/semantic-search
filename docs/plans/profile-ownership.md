# Profile ownership

Status: active, closed 2026-08-17 19:02:11 +0200, see section 9
Owner: repository owner
Last change: 2026-08-17 19:02:11 +0200
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
| Answered 2026-08-17 18:56:40 +0200, by running the probe rather than by reading the code. Whether the same unowned pattern exists for other per person tables. It does not. Bob added a source labelled `BOB PRIVATE FEED`; Alice's listing came back empty, her toggle returned 404, her delete returned 404 and Bob's source survived. Bob's item match was invisible in Alice's item list and `getUserMatch` returned null for her. Every query against `user_sources` and `user_matches` in `src/db.js` carries a user identifier, with one exception that is correct: `getEnabledSources` reads every enabled feed across accounts and is called only by `fetchFromUserSources` in `src/scheduler.js`, which fetches feeds rather than answering a request | closed |
| Whether `GET /api/config/profiles` is kept at all once it returns one row for the caller, given `GET /api/profiles/active` already answers that | The behaviours above are green and the endpoint has no caller in the client |
| Whether `db.saveProfile` is deleted. Found while fixing this: it inserts a profile with no `user_id`, and no live path calls it. `src/profile-generator.js` reaches it only through `fromText({ save: true })`, and both callers under `src/routes/` pass `save: false`. A row it wrote could never be read again once reads are owner scoped | The next module touch, per `docs/standards/COMPLEXITY.md` section 5, or an ADR under the proof of not needed |

## 9. Closed 2026-08-17 19:02:11 +0200

The probe of section 1.1 was rerun, the same way it was first run: two accounts registered against the
real Express app over supertest, Bob's profile carrying `BOB PRIVATE INTENT TEXT`, every request sent
with Alice's session.

| Request as Alice | Before | After |
|---|---|---|
| `GET /api/config/profiles` | 200 with Bob's row in full | 200 with an empty list |
| `POST /api/search` with Bob's `profileId` | 200, search ran on Bob's profile and echoed his keywords | 404 `NOT_FOUND`, no search ran and no keyword of his appears in the response |
| `DELETE /api/config/profiles/<Bob's id>` | 200 and Bob's profile was gone | 404 `NOT_FOUND` and Bob's profile is still there |

The probe file was deleted after the run, as before. What replaces it permanently is the suite: six
behaviours, five of them asserted from a second account's view, so the shape of test that could not
see this defect is no longer the shape this code is tested with.

One route outside section 3 was fixed with the others, and it is named here rather than left as a
silent extra. `POST /api/search/explain` also loads a profile by identifier, at
`src/routes/search.js` line 256. The plan's scope listed the three functions and the two routes that
reach them, and missed this fourth caller. The definition of done is what caught it, because it asks
whether any route handler passes a caller supplied identifier into a database function without the
caller's own identifier, and that question does not care which routes section 3 happened to list.

`npm run verify` is green: 70 suites, 636 tests passed, 6 skipped, 21 client tests, branches at 80.44
percent, lint clean of errors.
