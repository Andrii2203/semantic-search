# ADR-010: Hacker News, Reddit and Djinni are retired as product sources

Status: accepted
Owner: repository owner
Last change: 2026-08-15 11:10:48 +0200
Supersedes: docs/adr/006-user-sources-rss-first.md, the part that keeps three sources as `builtin` rows

Numbering note: ADR-009 is reserved by `docs/plans/evaluation-corpus.md` section 2 and
`docs/plans/retrieval-quality.md` section 2 for the evaluation corpus, and that file has not been
written yet. This ADR takes the next free number rather than the next unwritten one.

## 1. Problem

The three sources compiled into the process produce content that cannot be retrieved by meaning, and
the measurements are already in this repository.

In the 59 item snapshot of 2026-08-13, 54 items carry fewer than 50 words and 26 of 29 Hacker News
items have content identical to their own title, recorded in `docs/plans/evaluation-corpus.md`
section 1. A nine word headline carries a topic and no content, so no configuration of any axis can
retrieve it by meaning. `docs/plans/retrieval-quality.md` section 12 names this as the question that
sits ahead of all six axes.

Djinni adds two further defects of its own. It is scraped out of rendered HTML, which
`docs/adr/006-user-sources-rss-first.md` section 4 already calls the mistake not to repeat, and
`src/sources/djinni.js` line 46 logs that the layout has probably changed as a normal outcome. It is
also predominantly Ukrainian, which is why `docs/plans/retrieval-quality.md` section 4 already
excludes it from every measurement this project makes.

Reddit is read over RSS and survives on its own merits, but it is one site wired into the process
rather than a feed a person chose, which is the distance `docs/adr/006-user-sources-rss-first.md`
section 1 was written to close and never fully closed.

## 2. Decision

From 2026-08-15 the three built in sources stop being product sources. Content reaches the product
through user added feeds and uploaded documents only, which is the path
`docs/adr/006-user-sources-rss-first.md` built and `src/scheduler.js` line 180 already runs.

The modules, their registration, their `builtin` seeding and their tests are removed together. The
frozen evaluation snapshot under `eval/snapshots/2026-08-13/` is data and is not touched.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | Measured 2026-08-13 and recorded in `docs/plans/evaluation-corpus.md` section 1: 54 of 59 ingested items below 50 words, 26 of 29 Hacker News items identical to their title. Measured on the same snapshot: median 9 words against 126 for the RSS article corpus that replaced it |
| 2 | Cost of not doing it | Every axis in `docs/plans/retrieval-quality.md` is measured on content that carries no meaning to retrieve, so the winner of the matrix is chosen on a corpus the product should not have been ingesting |
| 3 | Cheapest alternative | Keep the three sources and fetch the linked article body for each, which is the open question in `docs/plans/retrieval-quality.md` section 12. Rejected as the first move because it is a scraper per site, it does not apply to Djinni at all, and RSS already delivers bodies at `MAX_BODY_LENGTH` without one |
| 4 | Kill criterion | A new account with no feeds added produces an empty inbox and people do not add feeds. The bottleneck was then onboarding, not content quality, and a starter feed set goes back in |
| 5 | Signal | Median word count per ingested item, per cycle. The 2026-08-13 baseline is 9 words for the built in sources and 126 for RSS articles |

## 4. What breaks, named exactly

Read from the source on 2026-08-15 between 11:00 and 11:10 +0200, clock read once at 11:10:48 +0200.

| Place | What it does today | What happens |
|---|---|---|
| `src/sources/index.js` lines 71 to 73 | Registers `hn`, `reddit`, `djinni` into the source map | The three `register` calls and the three modules are deleted. `fetchAll` over an empty map returns an empty array, which it already handles |
| `src/db.js` line 638 and `seedBuiltinSourcesForUser` | Seeds three `builtin` rows for every new account | Both are deleted. A new account starts with no sources |
| `src/scheduler.js` lines 183 to 187 | When a user enabled nothing, falls back to `sources.fetchAll()` | This is the one visible behaviour change. The fallback becomes an empty cycle, so a new account sees an empty inbox until it adds a feed. It needs an empty state in the client or a starter feed list, and that is scope, not breakage |
| `src/validation.js` line 9 | `source` is `z.string().min(1)`, not an enum | Nothing changes. No stored row becomes invalid |
| `src/db.js`, items already stored | Rows carry `source` of `hn`, `reddit` or `djinni` | They stay readable and searchable. Nothing reads a source name to decide behaviour except the matching filter, which reads the user's own enabled list |
| `__tests__/sources/hn.test.js`, `reddit.test.js`, `djinni.test.js`, `djinni.smoke.js` | Test the three fetchers | Deleted with their subject, per `docs/standards/TESTING_STANDARD.md`. A test whose behaviour no longer exists is not evidence of anything |
| `__tests__/routes/sources.test.js`, `db.test.js`, `api.test.js`, `integration-tests-uncovered.test.js` | Assert the three seeded rows | Assertions on the seeded set are rewritten to assert an empty starting set |
| `client/src/components/SourcesPage.jsx` | Renders `builtin` rows next to feeds | The `builtin` branch is removed. The page becomes feeds and files only |
| `src/config.js` lines 62 to 69 | `REDDIT_SUBREDDITS`, `REDDIT_LIMIT`, `DJINNI_KEYWORDS`, `DJINNI_LIMIT` | Deleted, with the same names in `.env.example`, `docker-compose.yml` and `README.md` |
| `eval/snapshots/2026-08-13/`, `eval/intents.json`, `eval/judgments.json` | The frozen bench. Its intents are Hacker News and Reddit posts | Untouched and still valid. `docs/plans/retrieval-quality.md` section 4 already forbids fetching during a run, so the bench never depended on the sources being live |

Nothing in the retrieval path, the chunker, the matcher or the inbox reads a source name. The answer
to whether this breaks the system is therefore no, with one exception that is a product gap rather
than a defect: an account with no feeds now has nothing to ingest.

## 5. The cost this carries, recorded rather than hidden

The local news bench is the only news evidence this project has, because
`docs/plans/public-benchmark.md` section 4 established that all three news collections in BEIR require
a licence rather than a download. Its intents are Hacker News and Reddit posts, and
`docs/plans/evaluation-corpus.md` section 10.1 rebuilds the missing half of that bench by ranking
candidate posts from those same two sites.

So retiring the two sites from the product removes the intake path for new intents. Two rules keep
that from silently killing the bench.

The frozen snapshot stays a valid measurement instrument, because it is committed data and every run
reads it from disk.

Harvesting public posts for the evaluation corpus is not the same act as ingesting them into a
person's inbox, and it stays permitted. `scripts/fetch-eval-corpus.js` is not part of the product and
`docs/plans/evaluation-corpus.md` section 12 already keeps it out of every run of the suite. If that
distinction is later refused, the bench needs a new intent population and that is a plan of its own.

## 6. Alternatives rejected

| Option | Why not |
|---|---|
| Keep the three sources and add article body fetching | One scraper per site, and it cannot work for Djinni at all. RSS already carries bodies, so the cheaper path is the one that keeps only RSS |
| Keep Hacker News only, drop the other two | Hacker News is the worst of the three by the measurement that drove this decision. 26 of 29 items had no content beyond their title |
| Keep them disabled by default rather than deleted | A disabled module still carries tests, configuration and a scraper that breaks. `docs/standards/DECISION_PROTOCOL.md` treats carrying cost as a cost, and nothing is bought by keeping them |
| Replace them with one curated starter feed list | Not rejected, deferred. It is the answer to the empty inbox in section 4 and belongs to the plan that carries this ADR |

## 7. Definition of done

- No module under `src/sources/` fetches Hacker News, Reddit or Djinni.
- A new account is created with zero sources and the client shows an empty state that names the next
  action.
- `npm run verify` is green with the tests of the deleted behaviour removed rather than skipped.
- `docs/plans/retrieval-quality.md` section 12 records that the first open question is answered by
  this ADR for the product, and remains open for the bench.

## 8. Rollback

| If | Action | Time |
|---|---|---|
| People do not add feeds and inboxes stay empty | A starter feed list ships as ordinary `user_sources` rows. No module returns | 1 hour |
| A feed shape appears that RSS cannot express | It becomes a source module registered through the same interface, which the registry still supports | hours |
| The evaluation corpus needs new intents from those sites | Section 5 permits it for the bench. Nothing in the product changes | not applicable |

## 9. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Where new evaluation intents come from once the product no longer touches Hacker News and Reddit | The bench needs more than the 8 answerable topics recorded in `docs/eval/local-news-axis-a.md` section 4 |
| Whether a starter feed list ships with the product, and who curates it | The first account created after this change reports an empty inbox |
| Whether stored items from the retired sources are deleted or left in place | A person asks why their inbox holds items from a source they cannot see in the sources page |
