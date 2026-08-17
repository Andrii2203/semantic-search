# ADR-019: The global active profile is removed

Status: rejected
Owner: repository owner
Last change: 2026-08-17 14:33:54 +0200
Supersedes: none

## 1. Problem

`db.getActiveProfile` reads the profile table with no owner:

```sql
SELECT * FROM profiles ORDER BY created_at DESC LIMIT 1
```

It was written on 2026-05-24 17:11:12 +0200, in commit `a8f6a3f`, the first commit that created the
schema. At that time the system had one user, so the most recently created profile was that person's
profile and the query was correct.

It is no longer correct. Since profiles gained a `user_id`, the same query returns whichever account
saved a profile last, so the name promises the reader's profile and the query returns somebody's.

It is not the only unowned read in the module, and the first draft of this ADR said it was. That
sentence was wrong and checking it found something larger: `getProfile`, `getAllProfiles` and
`deleteProfile` are also unowned, they are reachable from authenticated endpoints, and they are
exploitable today. That is a defect rather than a decision and it is recorded in
`docs/plans/profile-ownership.md`. It is not fixed here, because this file removes dead code and
mixing the two would hide a live defect inside a cleanup.

Measured 2026-08-17 12:45:00 +0200 by the import graph over `src/` and `scripts/`: no caller anywhere,
not in the routes, not in the scheduler, not in a script, not even in a test. Coverage confirms it
from the other side, reporting lines 1041 to 1050 of `src/db.js` as never executed.

So it is dead, and it is the kind of dead that is dangerous to revive. A future caller reaching for a
plausible name would get a cross account read that no type and no test would object to, because the
function does exactly what its name promises and the name is from a product that no longer exists.

## 2. Decision

The function and its export are deleted.

Proof of need: section 3 below, the proof of not needed from
`docs/standards/DECISION_PROTOCOL.md` section 4. The protocol applies because its section 2 names
deleting something that already exists.

## 3. Proof of not needed

| # | Question | Answer |
|---|---|---|
| 1 | Absent trigger | No caller exists. Measured 2026-08-17 12:45:00 +0200 over the import graph, and confirmed by a coverage report that marks the body as never executed |
| 2 | Cheaper path covers it | `getProfileByUserId` answers the same question correctly, by asking whose profile is wanted. It is already the function every live path uses |
| 3 | Cost exceeds benefit | The benefit is zero, because nothing calls it. The cost is a correctly named function that returns another account's data, sitting in the module a future change would reach into first |
| 4 | Reversibility | Twelve lines, one commit away in git history. Nothing about restoring it is hard, and restoring it should require saying why a profile is read without an owner |
| 5 | Carrying cost | One export, one entry in the `UNUSED_EXPORTS` list of `__tests__/reachability.test.js`, and a permanent invitation to a cross account read |

## 4. Scope

In scope:
- `getActiveProfile` in `src/db.js`, and its name in that module's `module.exports`.
- Its entry in the `UNUSED_EXPORTS` list of `__tests__/reachability.test.js`, which is removed because
  the list shrank rather than because the rule changed.

Out of scope:
- The `profiles` table and its rows. No schema change and no migration, because the defect is one
  query and not the storage it reads.
- The other fifteen entries in `UNUSED_EXPORTS`. Each is its own decision, taken when its module is
  next touched, per `docs/standards/COMPLEXITY.md` section 5.
- `docs/archive/plans/PLAN_v7.md`, which describes an active profile as a product concept. The archive
  is never edited, per `CLAUDE.md` section 3.

## 5. Behaviours

1. No file under `src/` defines or exports `getActiveProfile`.
2. No query in `src/db.js` selects a single profile by recency alone, meaning a `FROM profiles` query
   that limits to one row without a `WHERE` clause.

Behaviour 2 is deliberately narrower than "every profile read carries an owner", which is false and
should stay false. `getProfile` reads by profile identifier and `getAllProfiles` reads the whole table
for `src/routes/config-routes.js`. Neither is a cross account read, because neither claims to have
found the one profile that matters. The defect is the claim, not the absence of a filter.

## 6. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/reachability.test.js` |
| 2 | L1 | `__tests__/db.test.js` |

Behaviour 1 is covered without a new assertion. `__tests__/reachability.test.js` fails on any export
with no reference outside the test suite, and the debt list no longer names this one, so the check now
guards the absence rather than tolerating the presence.

Behaviour 2 reads the source of `src/db.js` and asserts that every `FROM profiles` query carries a
`user_id` filter. It is written the same way as behaviour 7 of
`docs/adr/011-one-cutoff-one-origin.md`, and for the same reason: the defect is a query shape, and
only a check over the text stops that shape returning.

## 7. Definition of done

- Every behaviour in section 5 has a passing test.
- `npm run verify` is green.
- `git grep -n getActiveProfile` returns nothing outside `docs/archive/` and this file.

## 8. Rollback

| If | Action | Time |
|---|---|---|
| Something needed a profile without an owner | Restore from this commit's parent, and write the ADR that says which caller reads a profile across accounts and why that is correct | 15 minutes |

## 9. Open questions

None. The function had no caller, its replacement is already in use everywhere, and the question of
what happens to the other fifteen unused exports is recorded in
`docs/adr/018-reachability-is-checked-by-the-suite.md` section 10.
