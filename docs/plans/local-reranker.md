# Local reranker in the product

Status: active
Owner: repository owner
Last change: 2026-08-17 21:43:19 +0200
Supersedes: none

## 1. Problem

The product ships a reranking feature that cannot run.

`src/reranker.js` scores documents by calling a language model through `src/groq-client.js`.
`docs/adr/020-reranking-runs-locally-and-stays-off-by-default.md` section 1 records that the model
named in `src/config.js` no longer exists and that no key is configured, so every call fails. The
failure is quiet: the feature is optional and defaults to off, the batch handler catches the error and
falls back to the original score, so a person who turns reranking on gets the fused order back with a
warning in the log and no indication that nothing was reranked.

The reranker that can run here was measured instead, and it is not in the product.
`docs/eval/beir-axis-e.md` ran a local MS MARCO cross encoder over four benches through
`src/eval/cross-encoder.js`, which loads through the runtime this repository already depends on, needs
no key and costs nothing per query. Its numbers are in section 4 of the ADR. That module is reachable
only from the evaluation harness, so the measured path and the shipped path are two different pieces
of code.

The two differ by more than the scorer. The bench reranks `rerankDepth`, which is 50, of the fused
list and then reports nDCG@10. The product reranks `topN`, which is 20, and returns the same 20, so it
can reorder what is already on the screen but can never pull the 21st fused result into the answer.
The configuration that was measured is not the configuration that would ship.

## 2. Decision

`src/reranker.js` scores with the local cross encoder, at the depth the bench measured, and the model
loader moves from `src/eval/cross-encoder.js` to `src/cross-encoder.js` so that the product and the
bench score with one module rather than two. Reranking stays optional and off by default. The four
constants that described the shape of the language model call stop existing, and the three that
describe the cross encoder move into the retrieval table of `docs/reference/search-constants.md`,
because they now change what search returns.

Proof of need: `docs/adr/020-reranking-runs-locally-and-stays-off-by-default.md`, whose section 5
names this work as out of its own scope and assigns it to the document that ships the phase 4 winners.
This is that document.

## 3. Scope

In scope:
- `src/reranker.js` rewritten onto the cross encoder, with the scorer injectable so the suite needs no
  model.
- The move of the model loader to `src/cross-encoder.js`, and `src/eval/harness.js` reading it there.
- Rerank depth in the search route, from `topN` to `rerankDepth`.
- The constants that follow from both, in `src/search-constants.js` and in
  `docs/reference/search-constants.md`.

Out of scope:
- Turning reranking on by default, because ADR-020 section 4 records a measurement that helps two
  collections and harms a third, and a default chosen against that would be a decision the bench
  declined to make.
- Deleting `src/groq-client.js` or the `groq-sdk` dependency, because five other modules call it and
  whether the language model paths survive is open question 4 of
  `docs/plans/retrieval-quality.md` section 12.
- Reranking in the ingest path, for the reason in ADR-020 section 5: admission is a threshold decision
  on one item, not an ordering.
- Any change to the numbers in `docs/eval/beir-axis-e.md`. This work ships a measured configuration,
  it does not measure a new one.

## 4. Behaviours

1. `rerank` returns an empty list when it is given no results.
2. `rerank` returns the results unchanged when the query is empty or is only whitespace.
3. `rerank` orders the results it scored by cross encoder score, highest first.
4. `rerank` scores at most `rerankDepth` results, and the results past that depth keep their fused
   order behind the scored ones.
5. A result the reranker scored carries a `rerankScore` between 0 and 1, and a result past the depth
   carries a `rerankScore` of null.
6. `rerank` returns the fused order and logs a warning when the scorer throws.
7. The search route reranks to `rerankDepth` and then returns `topN` results, so a result outside the
   first `topN` of the fused list can appear in the answer.
8. The search route calls the reranker only when the request sets `useReranker`.
9. `src/reranker.js` reaches no language model provider.
10. `src/eval/harness.js` and `src/reranker.js` score with the same module.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/reranker.test.js` |
| 2 | L1 | `__tests__/reranker.test.js` |
| 3 | L1 | `__tests__/reranker.test.js` |
| 4 | L1 | `__tests__/reranker.test.js` |
| 5 | L1 | `__tests__/reranker.test.js` |
| 6 | L1 | `__tests__/reranker.test.js` |
| 7 | L3 | `__tests__/routes/search.test.js` |
| 8 | L3 | `__tests__/routes/search.test.js` |
| 9 | L1 | `__tests__/reranker.test.js` |
| 10 | L1 | `__tests__/reranker.test.js` |

Behaviours 9 and 10 are checked by reading the two source files, the way
`__tests__/reachability.test.js` and `__tests__/search-constants.test.js` already check properties that
no assertion on a return value can see. Behaviour 9 is the one ADR-020 decided, and a test that runs
the model would be the only other way to see it.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run verify` is green.
- The four names the language model reranker owned are gone from `src/search-constants.js`, and their
  rows in `docs/reference/search-constants.md` say `removed` with the reason, the way
  `semanticCutoffSearch` already does. The two directions are checked by
  `__tests__/search-constants.test.js`, which reads the document and the module and compares the name
  sets.
- The scores the interface renders stay in the range it renders them in.
  `client/src/components/FilesMode.jsx` line 7 multiplies `rerankScore` by 100, and a cross encoder
  emits a logit, so the product applies a logistic function to it. That function is monotone, so the
  order the bench measured is the order the product returns, and this is a presentation change rather
  than a ranking one.
- The suite runs without downloading a model. Every test injects a scorer.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The cross encoder cannot load on the target host, for memory or for architecture | Reranking is off by default, so the product is unaffected until someone turns it on. The switch is one flag in the request | immediate |
| Reranking at depth 50 is too slow to be usable, at the measured 18 pairs per second | Pass a depth in the request, or lower `rerankDepth`. It is one number in `src/search-constants.js` | 2 minutes |
| The reorder is worse than the fused order on this product's own corpus | Turn the flag off, which is the default. The measurement that would settle it is `docs/eval/beir-axis-e.md` on a local bench larger than 8 intents | immediate |
| The move of the loader breaks the bench | `src/eval/harness.js` requires one path. Point it back | 2 minutes |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the second and a half that reranking 50 candidates costs is acceptable to a person waiting for a search | Reranking is proposed as a default, or a person reports the wait |
| Whether `rerankDepth` stays one number or becomes a per corpus setting | The vertical experiment in `docs/plans/retrieval-quality.md` section 13 runs |
| Whether the model is pinned by checksum, as the BEIR datasets are | A model update changes a number this project has published |
| Whether the four names found unused while checking this work are a second origin or dead weight. Measured at 2026-08-17 21:52 +0200 by listing every export of `src/search-constants.js` and counting its references under `src/` and `scripts/`: `preFilterMinChars` and `judgeSecondModel` are read by nothing, and `junkMinWordsToJudge` and `junkMinDistinctRatio` are read by nothing because `src/junk-filter.js` lines 3 and 4 declare `MIN_WORDS_TO_JUDGE` and `MIN_DISTINCT_RATIO` of its own. That is one concept at two origins, which is the defect section 1 of `docs/reference/search-constants.md` exists to prevent, and `no-magic-numbers` cannot see it because a literal assigned to a named const is exactly what the rule accepts | Not fixed here, because this document ships a reranker and a phase that fixes what it happens to find has no boundary. Forced by axis C or axis D touching the junk filter, or by the next constants pass |
