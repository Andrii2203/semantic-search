# System anatomy

Status: active
Owner: repository owner
Last change: 2026-08-16 14:56:45 +0200
Supersedes: none

## 1. Problem

Nothing in the repository says what is connected to what. Every document describes the part it owns,
and the shape of the whole exists only in whoever last read the code. That is how five modules came to
be written, tested and never called, each of them found by accident over two days rather than by
looking.

This document is the shape, taken from the code by tooling on 2026-08-16 between 14:20 and 14:50
+0200: an import graph over the 87 JavaScript files in `src/` and `scripts/`, a count of rows in every
data file, and the state of git.

## 2. Decision

Not applicable. This document records what exists. It states no plan and changes no behaviour.

Proof of need: not applicable, per `docs/standards/DECISION_PROTOCOL.md` section 2, which does not
govern a written record of the system as built.

## 3. Scope

In scope:
- What imports what, and what imports nothing.
- Where the two retrieval implementations diverge and where they meet.
- What data exists on disk and how much of it.

Out of scope:
- What should change about any of it, because that belongs to the plans and the ADRs that own each
  part.
- The client, beyond where it sends a retrieval parameter, because `docs/adr/005-client-test-runner.md`
  isolates it.

## 4. Adding a source is minutes, and this was checked rather than remembered

The claim under test: the product is built so that connecting any RSS feed is minutes of work rather
than a code change.

It holds, and here is the whole path. `POST /api/sources` with a URL writes one row to `user_sources`
with type `rss`. The cycle in `src/scheduler.js` reads the enabled rows, and `fetchFromSource` sends
anything of type `rss` to `rss.fetchFeed(row.url)`. No module is written, no constant is added, no
deploy happens.

Verified end to end on 2026-08-16 at 11:00 +0200 and recorded in
`docs/adr/010-sources-narrowed-to-user-feeds.md` section 6.1: an Ars Technica feed added by URL over
the API was read on the next cycle and produced 20 stored items with real bodies.

Two limits on the claim, so it is not read as more than it is.

It is true for RSS and Atom, which is what `src/sources/feed-reader.js` parses. Anything else, an API
with a key or a site without a feed, is a module registered through `src/sources/index.js`, which is
hours rather than minutes. That registry is now empty by
`docs/adr/010-sources-narrowed-to-user-feeds.md` and kept precisely so this door stays open.

And a feed reaching the corpus is not the same as a feed reaching an inbox. Admission is a separate
decision made by the cutoff, and a person whose profile does not match the feed will see nothing from
it however correctly it was added.

## 5. The bench is written the opposite way

Where the product takes a source at runtime, the bench takes a fixed file layout.

`src/eval/beir-loader.js` reads three files from disk: `corpus.jsonl`, `queries.jsonl` and
`qrels/test.tsv`. That is the shape BEIR publishes, and it is the shape everything downstream assumes.
`scripts/fetch-beir.js` downloads a public collection into it. `src/eval/local-bench.js` converts this
project's own snapshot into the same three files, which is why `eval/beir/` holds `local-news` and
`local-posts` next to SciFact, NFCorpus and FiQA.

So adding a collection to the bench is a conversion, not a connection. That asymmetry is not a defect:
a bench must read the same bytes on every run, and the product must accept whatever a person points it
at. They are opposite requirements and the code reflects them honestly.

## 6. Two retrieval implementations, one shared function

This is the largest structural fact in the repository and no document stated it before now.

| | Product | Bench |
|---|---|---|
| Entry | `src/routes/search.js` | `scripts/eval-beir.js`, `scripts/eval-local.js` |
| Lexical branch | `db.chunksSearch`, SQLite FTS5 | `src/eval/bm25.js`, hand written |
| Dense branch and fusion | `src/search-engine.js` | `src/eval/retrieval.js` |
| Candidate corpus | `db.getAllChunksWithVectors` | an in memory array from the loader |
| Shared code | `cosineSimilarity`, imported by `src/eval/retrieval.js` from `src/search-engine.js` | the same one function |

Nothing else crosses. Two BM25 implementations, two fusion implementations, two orderings, one shared
similarity function of fifteen lines.

The consequence is precise and it is worth stating without softening. Every number in `docs/eval/`
describes the right hand column. Every search a person runs uses the left. `docs/adr/008-parallel-candidate-generation.md`
was decided on the right and applied to the left on 2026-08-16 in
`docs/adr/011-one-cutoff-one-origin.md` section 7.2, and no measurement has ever compared the two
implementations against each other on the same input.

That comparison is the missing piece rather than a nice extra: until it exists, an axis measured on
the bench is evidence about the bench.

## 7. What nothing imports

Measured by the import graph, excluding `src/server.js` which is the entry point and `scripts/`, which
nothing is supposed to import.

Retaken 2026-08-17 12:45:00 +0200 by rebuilding the import graph from `src/server.js` and every file
in `scripts/`. The table below replaces the one taken on 2026-08-16, which was incomplete.

| Module | Note |
|---|---|
| `src/dispatcher.js` | Nothing under `src/` or `scripts/` requires it |
| `src/actions/index.js` | The action registry. Its only importer is `src/dispatcher.js`, so it is unreachable for the same reason. `src/routes/items.js` line 104 requires `src/actions/generate-comment.js` directly and never asks the registry |
| `src/eval/intent-selection.js` | Has four passing tests and no caller. It is the pruning half of the chooser rewritten on 2026-08-14, and the script that was to call it, `scripts/prune-intents.js`, named in the header comment of `scripts/choose-intents.js` line 11, was never written |

Sixteen exported names have no reference outside the test suite, and five of the eleven keys the
Settings page can write are read by nothing. Both lists are in `__tests__/reachability.test.js` rather
than here, because a list in a document goes stale and a list in a test cannot.

### 7.1 What the 2026-08-16 table got wrong

It said five artefacts of this family were found and connected or removed between 2026-08-15 and
2026-08-16. Four were. `SearchRequestSchema` was not: it is still exported by `src/validation.js` and
still referenced by nothing, and `docs/adr/011-one-cutoff-one-origin.md` section 7.2 recorded it as a
defect found rather than as a defect fixed. This document read that record as a fix.

That is the argument for `docs/adr/018-reachability-is-checked-by-the-suite.md` stated as plainly as it
can be. A reference document describing what is connected to what was wrong about its own subject
within a day of being written, because the only thing keeping it true was a person remembering.

### 7.2 Why the suite never saw any of it

Each had passing tests of its own. `src/dispatcher.js` reports 100 percent statement coverage and
`src/eval/intent-selection.js` reports 100 percent, because a test that calls dead code covers it
perfectly. The coverage threshold in `jest.config.js` has never failed on this class of defect and
cannot.

Of the seven found before today, four were caught by comparing a document's behaviour list against its
test table, one by searching the configuration for a rule name, and two by reading the import graph by
hand. Since 2026-08-17 12:47:23 +0200 the graph is read by `__tests__/reachability.test.js` on every
run instead, and `.githooks/pre-push` runs `npm run verify` before a push.

## 8. What the code depends on most

Fan in from the same graph, which says what a change is expensive to make.

| Module | Required by |
|---|---|
| `src/logger.js` | 35 |
| `src/config.js` | 16 |
| `src/search-constants.js` | 16 |
| `src/db.js` | 16 |
| `src/errors.js` | 14 |
| `src/search-engine.js` | 12 |

`src/search-constants.js` reaching 16 modules is the one worth noting: it was created on 2026-08-14 to
end folklore constants and is already as central as the database module.

## 9. What is on disk

| Path | Contents | Size |
|---|---|---|
| `eval/snapshots/2026-08-13/corpus.json` | Guardian and Ars Technica articles | 2509 |
| `eval/snapshots/2026-08-13/posts.json` | Hacker News and Reddit posts, the raw material for intents | 1596 |
| `eval/intents.json` | Posts promoted to intents | 50, split 34 dev and 16 locked |
| `eval/judgments.json` | The answer key | 1077 rows, grades 864 zero, 90 one, 75 two, 48 three |
| `eval/judgments-cross-check.json` | The second judge's overlap | 324 rows, Cohen's kappa 0.526 |
| `eval/pool.json` | The union of top results that was judged | |
| `eval/calibration.json` | The owner's own labels, and kappa against the judge | does not exist |
| `eval/beir/` | SciFact 16 MB, NFCorpus 12 MB, FiQA 131 MB, plus the local bench converted to the same layout | 165 MB, outside git |
| `data/app.db` | items, chunks with vectors, users, user_matches, settings, user_sources | 15 migrations |

Of 50 intents, 24 have at least one article graded 2 or 3. The other 26 are the group
`docs/plans/evaluation-corpus.md` section 5 keeps deliberately, where the correct answer is nothing.

The missing row is the one that matters most. `eval/calibration.json` is the only anchor to truth in
the whole apparatus: without it the reported kappa of 0.526 is agreement between two machines, not
agreement with a person, and `docs/plans/evaluation-corpus.md` section 9 makes that labelling a
condition for quoting any judge derived number.

## 10. Behaviours

Not applicable. This document records the system as built and changes nothing about it.

## 11. Tests

Not applicable, for the reason in section 10. The import graph and the counts can be recomputed at any
time and this document names how they were taken.

## 12. Definition of done

- Every claim here was produced by running something over the repository, not by recalling it.
- Any claim that was not verified says so in words.

## 13. Rollback

Not applicable. A reference document carries no runtime risk.

## 14. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the product and the bench become one retrieval implementation | An axis result is quoted as a fact about the product |
| Whether `src/dispatcher.js`, `src/actions/index.js` and `src/eval/intent-selection.js` are wired up or deleted | The next time either subject is worked on. `docs/adr/016-cover-letter-generation-removed.md` removed one of the registry's two actions and `docs/adr/017-comment-generation-deferred.md` deferred the other, so the registry now holds one entry |
| How often this document is retaken, given it is a snapshot | A reader is surprised by something it says. Section 7 is no longer the only record: `__tests__/reachability.test.js` fails the moment it goes stale |
