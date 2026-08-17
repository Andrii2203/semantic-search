# Retrieval quality

Status: active
Owner: repository owner
Last change: 2026-08-17 15:45:14 +0200
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

This section stands as written. A note added at 2026-08-15 11:10:48 +0200 claimed it was superseded
and that Ukrainian became a supported language. That note was withdrawn at 14:51:56 +0200 and the
reason is recorded in section 0 of `docs/adr/012-embedding-model-context-window.md`: it came from
misreading the repository owner, who had said the opposite. Ukrainian is out of scope, not held out
for a later decision.

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
| 2 | Constants extraction, no value changes | main | 1 | Turns every axis into configuration. Behaviour identical before and after, verified by re-running phase 1. Closed 2026-08-17 15:45:14 +0200, see section 6.3 |
| 3 | Baseline recorded | main | 2 | The number every later number is compared against |
| 3.5 | A public test collection as the primary bench for the engine axes | main | 2 | Added 2026-08-14. Instrument validated the same day: SciFact, NFCorpus and FiQA fetched and pinned, and BM25 reproduced the published baseline within 0.027 on all three. See `docs/eval/beir-bm25-control.md`. Remaining: a significance test, because the bench's resolution is now known to be coarse |
| 4 | Axes A, B, D, E as a matrix | `phase-8-retrieval` | 3, 3.5 | The four axes that are pure configuration once phase 2 lands. Measured on the public collection first, where the statistical power is, then on the local bench for the product's own task. Measured 2026-08-17, see sections 6.4 to 6.6. Two axes decided, two corpus dependent, no product code changed |
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
| Axis F carries a reason it cannot be dropped, and stays in phase 6 | `docs/adr/012-embedding-model-context-window.md` | Nothing moves. The order in section 6 is unchanged. The ADR records that the model's 256 token window cannot read a 300 word chunk, which is an English defect and not a language question. An earlier version of this row said Ukrainian became supported and axis F was promoted to phase 4. Both were withdrawn at 2026-08-15 14:51:56 +0200 |
| Dependencies are audited before a phase | `docs/standards/DEPENDENCY_STANDARD.md`, `docs/plans/dependency-upgrade.md` | Phase 0 is reopened as one step of the upgrade plan. Node 20 went end of life on 2026-04-30, and the native module that broke the build in section 6.1 is two majors behind |

The order in section 6 therefore reads: the dependency upgrade first, because the gate runs on it,
then phase 4 and axis F together, then the rest unchanged.

One cost is recorded rather than argued away. Promoting axis F means the axis matrix runs against a
moving model, which is the thing this plan was built to avoid. The alternative is worse: deciding
four axes on a model this project has already decided to replace, then repeating all of it. The rule
that keeps it honest is the one already in `docs/standards/EVALUATION_STANDARD.md` section 4, that a
score without its configuration is a rumour, and the configuration now includes the model identifier.

## 6.3 Phase 2, closed 2026-08-17 15:45:14 +0200

Every number that steers retrieval now has one place it is written and one document that says where it
came from. Measured before and after with the same probe, ESLint's `no-magic-numbers` over the seven
paths named in `docs/reference/search-constants.md` section 8: 40 literals before, 5 after, and the 5
are HTTP status codes that belong to the protocol rather than to this system.

| What moved | Where it went |
|---|---|
| 12 unnamed literals in the three language model calls of the retrieval path | named in `src/search-constants.js`, with a row and a trigger each in section 5 of the reference |
| 10 retrieval defaults duplicated in `src/config.js` | read from `src/search-constants.js`, so the environment overrides one value rather than a second copy of it |
| The vector element size in `src/search-engine.js` | `Float32Array.BYTES_PER_ELEMENT`, because four is the language's number and not a retrieval decision |

No value changed. That is asserted rather than claimed: `__tests__/config.test.js` compares every
retrieval default against the constant of the same concept, and the suite ran 623 tests green with the
same 6 skipped as before, plus 21 client tests.

Behaviour 4 of `docs/reference/search-constants.md` is enforced for the first time since it was
written. It had claimed a `no-magic-numbers` rule that no configuration ever contained, found on
2026-08-15 14:05:53 +0200 and recorded in `docs/plans/dependency-upgrade.md` section 5.4. The rule is
on, scoped to the retrieval path, and `__tests__/lint-magic-numbers.test.js` runs it through the ESLint
Node API so the suite fails if it is ever switched off again. Verified file by file at 2026-08-17
15:41 +0200: the rule fires on all eleven files of the retrieval path and on none outside it.

Two findings came out of the extraction and neither is fixed here, because this phase moves values and
changes none. The three language model calls run at temperature 0.1 and 0.2 rather than 0, so ingest
and keyword extraction can disagree with themselves between two runs of the same input, which axis C
and axis D will have to account for. And an orphan test was found: the isolation check on
`src/search-engine.js` was owned by no active document, only by an archived review, which
`CLAUDE.md` section 3 forbids as a source of truth. It is now behaviour 8 of the reference, narrowed
to what it actually protects.

## 6.4 Phase 4, axis D, measured 2026-08-17 17:06:39 +0200

Full numbers in `docs/eval/beir-axis-d.md`. The result changes what this plan believes about its own
section 1, so it is summarised here rather than only there.

Sending extracted keywords to the lexical branch instead of the query text, which is the third of the
four measured causes, costs +0.0044 nDCG@10 on SciFact, nothing on NFCorpus, +0.0051 on FiQA and
+0.0732 on the local news bench. Only the SciFact interval excludes zero, and 0.0044 is a fifth of
that collection's resolution. Against axis A at +0.0397 nDCG@10 and +0.0875 Recall@100, the query side
is a small effect on every bench that can measure it.

The expensive version of this axis is the one the product does not do. Embedding the keywords instead
of the person's text costs 0.0504 nDCG@10 and 0.0616 Recall@100 on FiQA, and 0.1937 of Recall@100 on
the local bench, both excluding zero. `src/profile-generator.js` line 43 embeds the raw input, so this
is a trap avoided rather than a defect found, and it is recorded because it is one function call away.

Why the public bench understates the axis is measured rather than argued, in section 8.1 of the
report: NFCorpus queries average 3.3 words, so there is nothing for an extractor to drop, while the
product's intents average 97.8. The public collections have the statistical power and the wrong query
shape; the local bench has the right shape and eight topics.

## 6.5 Phase 4, axis E, measured 2026-08-17 18:15:34 +0200

Full numbers in `docs/eval/beir-axis-e.md`, decision in
`docs/adr/020-reranking-runs-locally-and-stays-off-by-default.md`.

A local MS MARCO cross encoder, the option ADR-003 rejected in one line without a number, loses 0.0330
nDCG@10 on SciFact, wins 0.0140 on NFCorpus, wins 0.0158 on FiQA and wins 0.0819 on the local news
bench. The first two intervals exclude zero and point in opposite directions.

The mechanism behind the flip is the useful half. Every reranked score lands within 0.018 of the
published BM25+CE figure for the same collection, read from Table 2 of the BEIR paper on 2026-08-17
18:12 +0200. The reranker does not add a fixed amount, it pulls the top of the ranking towards its own
quality, so it raises a weak first stage and lowers a strong one. Whether it helps is decided by
whether the current ranking is already better than the reranker is, which is a question about the
corpus rather than about the axis.

That is the second axis in this project to refuse a global answer, after axis B, and both refusals
have the same shape as the vertical hypothesis in section 13. What ADR-020 settles is narrower: the
reranker that runs here is local, because the Groq path in `src/reranker.js` cannot run at all with
the model in `src/config.js` gone and no key configured, and reranking stays off by default because a
stage that helps two collections and harms a third is not a default.

## 6.6 What phase 4 has decided, and what it has not

| Axis | Verdict | Where |
|---|---|---|
| A. Candidate generation | Parallel, decided on three collections, +0.0397 nDCG@10 and +0.0875 Recall@100 over sequential | `docs/eval/beir-axes-a-b.md` section 6 |
| B. Fusion | Undecided. Weighted and rank fusion cannot be separated, and the shipped weights sit on the flat part of the curve | Same document, section 7.2 |
| D. Query side | The keyword transform on the lexical branch is below the resolution of every bench that could measure it. Embedding the keywords instead of the text is expensive and the product does not do it | `docs/eval/beir-axis-d.md` |
| E. Reranking | Corpus dependent, with the mechanism measured. Local cross encoder replaces the Groq path, off by default | `docs/eval/beir-axis-e.md`, ADR-020 |

Two of the four axes came back undecided, and that is a result rather than a gap. The plan was built
on the premise that four measured causes were waiting to be fixed in order of severity. Measured, the
order is not what section 1 assumed: axis A carries almost all of the available gain, the query side
carries very little, and reranking depends on the corpus. The remaining named cause, the 256 token
window of the model, is axis F in phase 6 and is still unmeasured.

What phase 4 has not done, and it is written here rather than discovered later. No product code
changed, per the rule this plan has followed since `docs/eval/beir-axes-a-b.md` section 12: the
matrix measures, and the winners ship under their own document. The per Guardian section reporting
that section 13 asks for was not run, because the local bench has 8 answerable intents in its dev
split and cannot carry a three way split. The vertical question was answered on the public bench
instead, where FiQA disagrees with SciFact and NFCorpus about which configuration wins, and that
disagreement is now visible on two axes rather than one.

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
  that superseded them. Done: ADR-001 by `docs/adr/008-parallel-candidate-generation.md`, ADR-003 by
  `docs/adr/020-reranking-runs-locally-and-stays-off-by-default.md` at 2026-08-17 18:15:34 +0200.
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
| Answered for the product 2026-08-16 11:07:48 +0200. Whether ingestion fetches the linked article body instead of indexing the headline. It does not fetch anything: the three sources that produced headlines were removed by `docs/adr/010-sources-narrowed-to-user-feeds.md`, and RSS carries bodies without a scraper. Measured on a live cycle the same day: an Ars Technica feed saved 20 items with real bodies. It stays open for the bench, whose intents are Hacker News and Reddit posts | closed for the product, open for the bench |
| Whether the search cutoff and the inbox cutoff become two settings | Phase 4 raises recall and admission volume rises with it |
| How large the evaluation corpus must be before a difference between two configurations is real rather than noise | Two configurations differ by less than the run to run variation recorded in phase 3 |
| Partly answered 2026-08-17 18:15:34 +0200. Whether the language model features stay, given that the Groq model named in `src/config.js` no longer exists and no key is configured. Reranking no longer needs one, by ADR-020. Keyword extraction runs on its frequency fallback and axis D measured that fallback as costing almost nothing, so the language model half of it has never been shown to buy anything either. Summarisation in the hierarchical chunker is untouched and belongs to axis C | The remaining half is answered by axis C in phase 5, or by a key appearing and a measurement showing the language model paths win |
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
