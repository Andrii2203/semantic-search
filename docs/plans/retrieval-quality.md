# Retrieval quality

Status: draft
Owner: repository owner
Last change: 2026-08-14 18:07:30 +0200
Supersedes: none

## 1. Problem

Search returns poor results, and four causes were measured on 2026-08-13 rather than guessed.

The semantic branch cannot retrieve. `src/routes/search.js` defaults to sequential mode, in which the
corpus scored by cosine similarity is the list BM25 already returned. An item containing no query
keyword cannot be found by any means. This was chosen deliberately in ADR-001 to save processor time.

The cutoff removes what survives. The route requires cosine 0.65 while
`docs/eval/inbox-admission.md` measured genuine semantic matches at a mean of 0.509 to 0.547. The
internet search screen sends no cutoff at all, so it uses 0.65, while the files screen sends 0.3.
That difference alone explains why file search feels better than internet search.

The query text never reaches the lexical branch. `db.chunksSearch` is given keywords extracted by a
language model or by a word frequency fallback, joined by OR. An exact phrase cannot be searched, any
term the extractor dropped is unreachable, and one common term is enough to match a chunk.

The model does not fit the use. Measured with the repository's own code: a Ukrainian query against a
relevant English document scores 0.182, an unrelated Ukrainian pair scores 0.562, a keyword trap
scores 0.491 while a genuine English paraphrase scores 0.448, and a 520 word input loses its tail
entirely to the 256 token window.

Taken together, internet search today is lexical search over an OR list of extracted keywords, with an
inert semantic branch attached to it.

A fifth cause was found on 2026-08-13 while taking the evaluation snapshot, and it may outrank the
other four. There is almost nothing to search. In a 59 item snapshot of what the product actually
ingests, 54 items carry fewer than 50 words and 26 of 29 Hacker News items have content identical to
their own title. The measurement and its four consequences are in
`docs/plans/evaluation-corpus.md` section 11. No configuration of any axis can extract meaning from a
9 word headline, so the question of whether ingestion should fetch the linked article body is now
ahead of the axes in importance, and is recorded as the first open question in section 12.

## 2. Decision

Search becomes one system whose retrieval behaviour is selected by named configuration rather than by
code, and the choice between configurations is decided by measurement against a frozen corpus with a
committed answer key. The six axes in `docs/reference/retrieval-in-industry.md` section 7 are varied
one at a time, so every number attributes to exactly one decision. Three changes that cannot be
expressed as configuration get a branch each.

Proof of need: the four causes in section 1 are defects, each reproducible, and
`docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes from the proof of need. The
evaluation corpus and the configuration matrix are new and carry ADR-009.

## 3. Scope

In scope:
- A frozen, committed evaluation corpus for internet search, in English, with the dirty categories
  from `docs/standards/EVALUATION_STANDARD.md` section 3, split into dev and locked, stratified.
- Extraction of every retrieval number into `src/search-constants.js` with no change of value.
- Axes A, B, D and E measured as configuration on one branch.
- Axes C and F measured on their own branches, because both require reindexing.
- One report per axis in `docs/eval/`, appended, never overwritten.

Out of scope, each with its reason:
- Approximate nearest neighbour indexing, because no latency measurement shows a problem at this
  corpus size, and `docs/standards/DECISION_PROTOCOL.md` question 1 requires a trigger that already
  happened.
- Synonyms, spelling correction and intent expansion beyond axis D, because they are a second branch
  and would make the first one never close.
- Freshness, popularity and trust signals in ranking, for the same reason.
- Training on interaction data, because `docs/reference/retrieval-in-industry.md` section 8 records
  that the logs do not exist yet. Trigger: one hundred logged decisions.
- Two tower retrieval, Uber scale index tuning, gradient boosted ranking and knowledge graphs, for the
  reasons recorded in the same section.
- Ukrainian language quality as an optimisation target. It is a holdout check, see section 5.

## 4. Sources: kept, and frozen

Superseded in part on 2026-08-15 11:10:48 +0200 by `docs/adr/010-sources-narrowed-to-user-feeds.md`.
The three sources no longer stay in the product. Everything below about the snapshot being frozen and
never fetched during a run is unchanged and is what keeps the existing bench valid. See section 6.2.

Hacker News, Reddit and Djinni stay in the product. They are the only real, messy content available,
and `docs/standards/EVALUATION_STANDARD.md` section 6 states that a corpus written by us cannot
describe behaviour on real feeds.

They are not fetched during evaluation. Live fetching makes a run unreproducible, because the corpus
changes between two runs of the same configuration, which contradicts section 7 rule 1 of the
evaluation standard. One snapshot is taken, committed to git, and every run reads the snapshot.

Djinni is excluded from the evaluation corpus, not from the product. It is predominantly Ukrainian,
and section 5 fixes the measurement language as English so that the model axis does not contaminate
the other five.

## 5. Language

Superseded on 2026-08-15 11:10:48 +0200 by `docs/adr/012-multilingual-embedding-model.md`. Ukrainian
stops being a holdout and becomes a supported language with a bench of its own. The isolation argument
below still holds for the five axes measured on the current model, which is why the English
collections stay the place where the axes are decided. See section 6.2.

Measurement is in English. The reason is isolation: the measured cross language score of 0.182 is
larger than the difference any other axis will produce, so a mixed language corpus would report the
language effect as if it were a fusion effect or a reranking effect.

A small Ukrainian set is held out and never tuned against. It is run once against the winning
configuration, and its only job is to answer whether the winner collapses on the product's real
traffic. A winner that scores well in English and fails there is not a winner.

## 6. Order of work

The order follows dependencies, not severity. Every phase carries its own document, its own tests and
its own entry in `docs/eval/`.

| # | Phase | Branch | Depends on | Why here |
|---|---|---|---|---|
| 0 | A build that runs | main | nothing | Closed 2026-08-14 18:06 +0200. See section 6.1 |
| 1 | Evaluation corpus for internet search | main | 0 | Nothing that follows can be judged without an answer key, and the existing harness only covers files mode |
| 2 | Constants extraction, no value changes | main | 1 | Turns every axis into configuration. Behaviour identical before and after, verified by re-running phase 1 |
| 3 | Baseline recorded | main | 2 | The number every later number is compared against |
| 3.5 | A public test collection as the primary bench for the engine axes | main | 2 | Added 2026-08-14. Instrument validated the same day: SciFact, NFCorpus and FiQA fetched and pinned, and BM25 reproduced the published baseline within 0.027 on all three. See `docs/eval/beir-bm25-control.md`. Remaining: a significance test, because the bench's resolution is now known to be coarse |
| 4 | Axes A, B, D, E as a matrix | `phase-8-retrieval` | 3, 3.5 | The four axes that are pure configuration once phase 2 lands. Measured on the public collection first, where the statistical power is, then on the local bench for the product's own task |
| 5 | Axis C, constructed chunk text | `phase-8-context` | 4 | Requires reindexing, and its value depends on the retrieval fixed in phase 4 |
| 6 | Axis F, embedding model | `phase-8-model` | 4 | Requires reindexing and a model version column. Multilingual keeps 384 dimensions, so the stored layout survives |
| 7 | Query time chunking | `phase-8-query-chunking` | 5 | The Dropbox shape. Different data lifecycle, measured against phase 5 |
| 8 | Locked half, once | main | 4 to 7 | Spent once, on the winner, as the evaluation standard requires |

Phases 0 to 3 change no ranking behaviour. That is deliberate: three phases of work before the first
improvement, so that the first improvement can be believed.

## 6.1 Phase 0, closed 2026-08-14 18:06 +0200

The cause was named exactly rather than worked around. `npm install` on the development machine runs
Node 24 and has no Python, so `better-sqlite3` 11.10.0 finds no prebuilt binary for that Node version,
falls back to compiling from source, and node-gyp fails at "Could not find any Python installation to
use". The install stops there, which is why `node_modules` held a `jest` shim in `.bin` and no `jest`
package. Nothing in the repository was broken. The machine could not build one native dependency.

The fix is a `test` stage in the `Dockerfile`, on Node 20 with `python3`, `make` and `g++`, which is
the environment the production stage already used for the same reason. Two commands, and they are the
gate this project runs from now on until the host toolchain changes:

```
docker build --target test -t semantic-search-test .
docker run --rm semantic-search-test npm test
```

Result of the first full run, at 2026-08-14 18:06 +0200: 61 suites passed, 1 skipped, 575 tests
passed, 6 skipped, zero failures. `npx eslint src/ __tests__/ scripts/` reports zero errors and three
pre-existing unused variable warnings.

Recorded because it changes what a green run means. Until now no number in this project had ever been
produced by a machine that could run the suite, and every claim of done rested on reading the code.

## 6.2 What changed on 2026-08-15, and what it costs this plan

Four decisions were taken on 2026-08-15 11:10:48 +0200 and each one moves something this plan had
scheduled. They are recorded here because a plan that contradicts its own ADRs is worse than no plan.

| Decision | ADR | Effect on this plan |
|---|---|---|
| The three built in sources are retired | `docs/adr/010-sources-narrowed-to-user-feeds.md` | Section 4 is superseded in part. The first open question of section 12, whether ingestion fetches the article body, is answered for the product: RSS carries bodies, so the product stops indexing headlines. It stays open for the bench, whose intents are Hacker News and Reddit posts |
| The search cutoff is deleted rather than retuned | `docs/adr/011-one-cutoff-one-origin.md` | Section 7 said axis A and the cutoff move together in one commit. They still do, and the cutoff's half of that commit is now a deletion. The second open question of section 12, whether search and inbox cutoffs split, is closed: one of the two stops existing |
| Ukrainian becomes supported and axis F is promoted | `docs/adr/012-multilingual-embedding-model.md` | Section 5 is superseded. Phase 6 moves next to phase 4 in section 6, because every constant measured on `all-MiniLM-L6-v2` is void when the model changes, and measuring axes on a model that is about to be replaced spends the work twice |
| Dependencies are audited before a phase | `docs/standards/DEPENDENCY_STANDARD.md`, `docs/plans/dependency-upgrade.md` | Phase 0 is reopened as one step of the upgrade plan. Node 20 went end of life on 2026-04-30, and the native module that broke the build in section 6.1 is two majors behind |

The order in section 6 therefore reads: the dependency upgrade first, because the gate runs on it,
then phase 4 and axis F together, then the rest unchanged.

One cost is recorded rather than argued away. Promoting axis F means the axis matrix runs against a
moving model, which is the thing this plan was built to avoid. The alternative is worse: deciding
four axes on a model this project has already decided to replace, then repeating all of it. The rule
that keeps it honest is the one already in `docs/standards/EVALUATION_STANDARD.md` section 4, that a
score without its configuration is a rumour, and the configuration now includes the model identifier.

## 7. Axis A note

Axes A and the cutoff move together in one commit, and the reason is worth recording because it looks
like two changes. Parallel retrieval with the cutoff left at 0.65 returns almost nothing, because the
cutoff removes the candidates. A lower cutoff in sequential mode also returns almost nothing, because
there are no candidates to keep. Measured separately, both look like failures. They are one change.

A consequence is recorded rather than fixed here: raising search recall raises the volume reaching the
inbox at the same cutoff, and the search cutoff and the inbox cutoff are currently one setting. The
evaluation standard section 5 states the inbox is deliberately biased to precision. Splitting them is
the open question in `docs/reference/search-constants.md` section 10.

## 8. Behaviours

1. The evaluation corpus is a committed file, and two runs of the same configuration against it
   produce the same numbers.
2. Every item in the evaluation corpus declares its category and its split.
3. Each split contains every category, so that neither half measures a different product.
4. The evaluation harness accepts a named configuration and reports one row per configuration.
5. The harness reports counts per category, not one averaged number.
6. A configuration report names the items wrongly admitted and wrongly missed.
7. Djinni items do not appear in the evaluation corpus.
8. Running the harness performs no network call to a source.

## 9. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/eval/corpus.test.js` |
| 2 | L1 | `__tests__/eval/corpus.test.js` |
| 3 | L1 | `__tests__/eval/corpus.test.js` |
| 4 | L2 | `__tests__/eval/harness.test.js` |
| 5 | L2 | `__tests__/eval/harness.test.js` |
| 6 | L2 | `__tests__/eval/harness.test.js` |
| 7 | L1 | `__tests__/eval/corpus.test.js` |
| 8 | L4 | `__tests__/eval/harness.test.js` |

## 10. Definition of done

- Every behaviour in section 8 has a passing test.
- `npm run verify` is green, which requires phase 0.
- One report per axis exists in `docs/eval/`, each naming its configuration, per category counts and
  named failures.
- The locked half was run exactly once, after the winner was chosen.
- ADR-001 and ADR-003 carry status superseded, with the replacement ADRs naming the measured numbers
  that superseded them.
- The Ukrainian holdout was run once against the winner and its result is recorded, whatever it says.

## 11. Rollback

| If | Action | Time |
|---|---|---|
| An axis makes results worse | It is one named configuration. Change the name in the default, no code revert | 2 minutes |
| Phase 2 changed behaviour by accident | Re-run phase 1 against the phase 3 baseline. Any difference is the defect | 20 minutes |
| The model branch degrades quality | Model identifier and version are stored per vector, so the previous model's vectors are still valid. Reindex back | 1 hour |
| Dev and locked disagree at the end | That is a finding, not a failure. Record it and do not ship the winner | not applicable |

## 12. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether ingestion fetches the linked article body instead of indexing the headline | Already triggered. Measured on 2026-08-13: 54 of 59 ingested items carry fewer than 50 words. Needs the decision protocol and its own ADR before any axis is measured, because it changes what every later number is measured on |
| Whether the search cutoff and the inbox cutoff become two settings | Phase 4 raises recall and admission volume rises with it |
| How large the evaluation corpus must be before a difference between two configurations is real rather than noise | Two configurations differ by less than the run to run variation recorded in phase 3 |
| Whether the language model features stay, given that the Groq model named in `src/config.js` no longer exists and no key is configured | Phase 4 measures axis D and axis E with the language model paths disabled |
| Whether one configuration serves every topic, or each vertical needs its own | Already answerable on data in hand, see section 13 |
| Whether this engine is packaged per vertical | Not now. Trigger: section 13 shows the winning configuration differs by topic, and a second person asks for it |

## 13. Verticals, and the experiment that decides them

The product intent is a universal engine. The commercial shape being considered is a set of
verticals, each a packaged instance aimed at one subject area. If retrieval quality is domain
specific, then each vertical needs its own tuned configuration and its own answer key, and those two
artefacts, not the engine, are what a vertical actually consists of.

The field's evidence says quality is domain specific. BEIR exists because a retriever that wins on
one collection loses on another, which is why the benchmark is heterogeneous and zero shot rather
than a single corpus. That is evidence by analogy, though, drawn from other people's data.

This project can answer the question on its own data instead, at no extra cost, because the corpus is
already segmented by subject: 1509 Guardian business articles, 644 technology, 356 science, all under
one answer key.

The experiment. When the axis matrix of phase 4 runs, report every metric per Guardian section as
well as overall. Then read the winner per section.

| Outcome | What it means | What follows |
|---|---|---|
| The same configuration wins in all three sections | Quality is not domain specific at this scale, on this data | One global configuration. Verticals are packaging and pricing, not tuning. Far less to maintain |
| Different configurations win in different sections | Quality is domain specific here, not only in the literature | A vertical is a configuration plus an answer key. The per vertical answer key is the asset worth protecting, and the engine is the cheap half |

The measurement costs nothing beyond grouping numbers that will already exist, and it turns a product
guess into a finding. Deciding the packaging before it runs would be deciding without the evidence
that is one report away.

One caution recorded with it. Six verticals means six configurations and six benches to keep fresh,
and a bench nobody refreshes is worse than none because it still produces numbers. Whatever the
experiment says, the count of verticals is a maintenance decision before it is a product one.
