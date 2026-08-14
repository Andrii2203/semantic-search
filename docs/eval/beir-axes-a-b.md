# BEIR axes A and B

Status: active
Owner: repository owner
Last change: 2026-08-14 19:23:48 +0200
Supersedes: none

## 1. Problem

`docs/plans/retrieval-quality.md` section 1 states that the semantic branch of this product cannot
retrieve, because `mode: 'sequential'` scores only what the lexical branch already returned. ADR-001
chose that shape to save processor time. Neither the defect nor the decision had ever been measured
against an alternative on a collection with human relevance judgments.

Axis A is the choice of candidate generation: sequential, parallel, or one branch alone. Axis B is
the choice of fusion once two branches exist.

## 2. Decision

Not applicable. This document records a measurement. The decisions it feeds are ADR-001 and phase 4
of `docs/plans/retrieval-quality.md`.

Proof of need: the defect in section 1 of that plan, which
`docs/standards/DECISION_PROTOCOL.md` section 2 exempts from the protocol.

## 3. Scope

In scope:
- Five named configurations over SciFact and NFCorpus, on nDCG@10 and Recall@100.
- Paired bootstrap intervals for the two comparisons that decide the axes.

Out of scope:
- FiQA-2018, which was still embedding when this was written and gets its own row when it finishes.
- Reranking, axis E, which is a separate stage and a separate measurement.
- Any change to the product. This document measures, it does not ship.

## 4. What was run

Vectors from `Xenova/all-MiniLM-L6-v2`, the model the product already uses, computed once per
collection and cached. SciFact took 388.6 seconds for 5183 documents, NFCorpus 301.2 for 3633, at
roughly 13 documents per second on one container. Runs at 2026-08-14 between 18:58 and 19:23 +0200,
clock read at 19:23:48 +0200.

| Configuration | Axis A | Axis B |
|---|---|---|
| `bm25-repository-defaults` | lexical alone | not applicable |
| `dense-only` | dense alone, whole corpus | not applicable |
| `sequential-rescore` | lexical candidates, rescored by cosine. This is what the product ships | not applicable |
| `parallel-rrf` | both branches independently | reciprocal rank fusion at rank constant 60 |
| `parallel-weighted` | both branches independently | normalised scores at 0.4 lexical, 0.6 dense |

## 5. Result

| Configuration | SciFact nDCG@10 | SciFact Recall@100 | NFCorpus nDCG@10 | NFCorpus Recall@100 |
|---|---|---|---|---|
| `bm25-repository-defaults` | 0.6645 | 0.8792 | 0.3071 | 0.2346 |
| `dense-only` | 0.6539 | 0.9317 | 0.3114 | 0.3050 |
| `sequential-rescore` | 0.6551 | 0.8792 | 0.3248 | 0.2346 |
| `parallel-rrf` | 0.6948 | 0.9583 | 0.3438 | 0.3221 |
| `parallel-weighted` | 0.7229 | 0.9583 | 0.3388 | 0.3184 |

## 6. Axis A is decided, and the defect is now a number

| Comparison | Dataset | Metric | Difference | 95 percent interval |
|---|---|---|---|---|
| `parallel-rrf` over `sequential-rescore` | SciFact | nDCG@10 | +0.0397 | [0.0199, 0.0597] |
| `parallel-rrf` over `sequential-rescore` | SciFact | Recall@100 | +0.0791 | [0.0490, 0.1112] |
| `parallel-rrf` over `sequential-rescore` | NFCorpus | nDCG@10 | +0.0190 | [0.0086, 0.0294] |
| `parallel-rrf` over `sequential-rescore` | NFCorpus | Recall@100 | +0.0875 | [0.0705, 0.1066] |

Four intervals, none contains zero, and the first configuration wins in 100 percent of resamples in
all four. Every difference clears the resolution measured in `docs/eval/beir-bm25-control.md`
section 6.1, which is 0.022 on SciFact and 0.008 on NFCorpus.

The sharpest line in the table above is not in this comparison, though. It is that
`sequential-rescore` and `bm25-repository-defaults` have identical Recall@100 on both collections,
0.8792 and 0.2346, to four decimals. That is not a coincidence to be explained, it is the definition
of the defect made visible: rescoring a lexical candidate list cannot retrieve a document the lexical
branch did not return, so its recall ceiling is exactly BM25's recall. The diagnosis of 2026-08-13
said this in words. The bench now says it in numbers, on a public collection, twice.

What the product gives up by shipping sequential, measured on NFCorpus: 0.0875 of Recall@100, which
is 37 percent of what it currently retrieves.

ADR-001 traded that for processor time. The trade is now quantified on both sides: the parallel run
costs the embedding of the corpus once, which is cached and reused, and 13 to 15 seconds per full
collection pass against 12 to 13 for sequential. On this hardware, at this corpus size, the saving
ADR-001 bought is under three seconds per pass and the cost is a third of recall.

## 7. Axis B is decided on one collection and tied on the other

| Comparison | Dataset | Metric | Difference | 95 percent interval |
|---|---|---|---|---|
| `parallel-weighted` over `parallel-rrf` | SciFact | nDCG@10 | +0.0281 | [0.0132, 0.0436] |
| `parallel-weighted` over `parallel-rrf` | NFCorpus | nDCG@10 | -0.0050 | [-0.0157, 0.0048] |

Weighted fusion at 0.4 and 0.6 beats reciprocal rank fusion on SciFact and is indistinguishable from
it on NFCorpus. There is no collection where rank fusion is measurably ahead.

That result deserves a caution rather than a celebration. The weights 0.4 and 0.6 are recorded as
arbitrary in `docs/reference/search-constants.md`, and a configuration with two free parameters
beating one with a fixed constant on one collection out of two is the weakest kind of win. The
rank constant of 60 was also never tuned, and its published optimum is flat. Axis B should be called
undecided until FiQA lands and until the weights are varied, which is a matter of minutes now that
the vectors are cached.

## 8. What dense retrieval alone says

`dense-only` scores about the same as BM25 on nDCG@10 on both collections, 0.6539 against 0.6645 and
0.3114 against 0.3071, while retrieving substantially more of the relevant set: Recall@100 of 0.9317
against 0.8792, and 0.3050 against 0.2346.

The two branches are not competing at the same thing. Lexical ranks its hits well, dense finds more
of them, and that difference is the whole reason the parallel configurations win. It is also the
published position of every system in `docs/reference/retrieval-in-industry.md` section 5, point 1:
nobody runs pure vector retrieval, and dense retrieval is added next to lexical rather than in place
of it.

## 9. Behaviours

Not applicable, this document records a measurement. The behaviours exercised are 20 to 25 of
`docs/plans/public-benchmark.md`.

## 10. Tests

Not applicable, for the same reason. The retrieval path is pinned by `__tests__/eval/retrieval.test.js`
with an injected embedder, so those tests need no model and no corpus.

## 11. Definition of done

- Five configurations ran over two collections and every number is above.
- The two comparisons that decide the axes carry intervals, not point values.
- The result that contradicts ADR-001 is stated with the cost of the trade on both sides.

## 12. Rollback

Not applicable. No runtime behaviour changed. The product still ships sequential retrieval until a
change is made under its own plan.

## 13. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether FiQA agrees with both collections on axis A | The run finishes. It was still embedding 57638 documents when this was written |
| Whether weighted fusion holds up when its two weights are varied, and whether the rank constant matters at all | Already triggered by section 7. Both are minutes of compute now that vectors are cached |
| Whether ADR-001 is superseded, and by which measurement | Already triggered by section 6. It needs a superseding ADR naming these numbers, per `docs/plans/retrieval-quality.md` section 10 |
| Whether the same ordering holds on the product's own news corpus, where documents are short and the model is out of domain | The local bench runs the same five configurations |
