# The Hub's test database

Status: active
Owner: repository owner
Last change: 2026-08-23 21:24:42 +0200
Supersedes: none

## 1. Problem

The Hub's integration suite runs against the database the product runs on, and one of its tests
empties it.

`backend/tests/auth.integration.spec.ts` line 28 called `prisma.user.deleteMany()` with no filter in
`beforeEach`. Every account goes, and the foreign keys take feeds, article processings and chunks
with them. Measured on 2026-08-23 at 21:05 +0200: the live check of
`docs/plans/retrieval-in-the-hub.md` section 9 had left an account with 20 articles and 22 embedded
chunks, a full run of `npm run test:e2e` followed, and the counts afterwards were zero users, zero
processings, zero chunks.

The unfiltered delete is the visible half. The half that stays after it is fixed is that
`DATABASE_URL` for a test run points at the product's database, so every other spec writes its
fixtures into the same rows the product serves, and any future test can do the same damage by
accident.

## 2. Decision

The integration suite runs against a database of its own, whose name ends in `_test`, created and
migrated before the first spec. A run refuses to start against any other database, so the product's
data cannot be reached by a test even when a test is wrong.

Proof of need: `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes from the proof of
need, and the deleted rows above are the defect, reproduced by running the suite.

## 3. Scope

In scope:
- A derivation from `DATABASE_URL` to the test database URL, and a guard that refuses anything else.
- A jest configuration for the integration suite that applies the migrations to that database before
  the first spec.
- The unfiltered delete in `auth.integration.spec.ts`, narrowed to the account that spec creates.

Out of scope, each with its reason:
- A container of its own for the test database. The same Postgres server holds a second database,
  which costs nothing and keeps `docker compose up` unchanged.
- Resetting the test database between runs. A run that leaves rows behind is a fixture problem in the
  spec that left them, and each spec already cleans up after itself.
- The unit suite, which touches no database and stays as it is.

## 4. Behaviours

1. The integration suite connects to a database whose name ends in `_test`.
2. The derivation refuses a URL that names no database, rather than guessing one.
3. The derivation leaves a URL that already names a test database unchanged.
4. The test database carries every table the migrations create.
5. Deleting every row of a table in the test database leaves the product database unchanged.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L2 | `backend/tests/database.integration.spec.ts` |
| 2 | L1 | `backend/tests/support/database.spec.ts` |
| 3 | L1 | `backend/tests/support/database.spec.ts` |
| 4 | L2 | `backend/tests/database.integration.spec.ts` |
| 5 | L2 | `backend/tests/database.integration.spec.ts` |

Behaviour 5 is the one that reproduces the defect. It opens a second connection to the product
database, counts its users, empties the users table of the test database, and counts again.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run lint` and `npm test` are green in `backend`, and `npm run test:e2e` is green against the
  test database.
- The product database keeps its rows across a full suite run, checked by counting before and after.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The test database cannot be created on the target server | The guard names the database it wanted and stops. Create it by hand once, the run continues | minutes |
| Migrations take too long before every run | They are applied by `migrate deploy`, which is a no operation when nothing is pending | not applicable |
| A spec depends on data that only the product database holds | That spec was never isolated. It builds its own fixture, like the other five | one spec |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether CI gets its own Postgres service or reuses this arrangement | The first CI run of the integration suite |
| Whether the test database is dropped and recreated per run rather than migrated | A migration that cannot be applied twice, or a spec that leaves rows behind |

## 9. The first run, and the drift it found

Run 2026-08-23 21:26 to 21:27 +0200. Eight suites, 37 tests, green, against `newsintel_test`.
Counted immediately afterwards: the product database keeps its one account, the test database holds
none, which is behaviour 5 seen from outside the suite as well as inside it.

The first attempt failed, and the reason is worth the paragraph because it was not caused by this
change. `newsintel_test` already existed, created 2026-08-23 12:46:37 UTC by an earlier session, and
`prisma migrate deploy` refused with P3009: the migration `20260823144500_entity_postings_index`
had failed there at 19:26:05 UTC with `relation "processing_entities_entityId_idx" already exists`.
Someone had created that index in that database without its migration, so the schema and the
migration history disagreed.

It was dropped and recreated from the migrations. What it contained first was checked rather than
assumed: one account, `test@test.com`, no articles and no feeds, which is a leftover fixture and not
data anybody needs.

The same account exists in the product database, and that is the defect of section 1 seen from the
other side: the suite had been registering its fixtures there for as long as it has existed.
