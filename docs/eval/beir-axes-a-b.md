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

That result deserved a caution rather than a celebration, because the weights 0.4 and 0.6 are recorded
as arbitrary in `docs/reference/search-constants.md` and the rank constant of 60 had never been
varied here. Both were swept at 2026-08-14 19:46:15 +0200, which the cached vectors made cheap.

### 7.1 Both free parameters, swept

| Rank constant | SciFact nDCG@10 | NFCorpus nDCG@10 |
|---|---|---|
| 10 | 0.7142 | 0.3469 |
| 20 | 0.7050 | 0.3462 |
| 60 | 0.6948 | 0.3438 |
| 100 | 0.6930 | 0.3423 |
| 200 | 0.6927 | 0.3417 |

| Lexical weight | SciFact nDCG@10 | NFCorpus nDCG@10 |
|---|---|---|
| 0.2 | 0.7170 | 0.3346 |
| 0.3 | 0.7292 | 0.3405 |
| 0.4, what this repository ships | 0.7229 | 0.3388 |
| 0.5 | 0.7168 | 0.3337 |
| 0.6 | 0.7065 | 0.3306 |
| 0.7 | 0.6982 | 0.3244 |
| 0.8 | 0.6926 | 0.3174 |

Three readings, and the third is a warning about method rather than a result.

The rank constant moves the score monotonically and smaller is better, but the whole sweep from 10 to
200 spans 0.0215 on SciFact and 0.0052 on NFCorpus. Both are at or under the resolution of those
collections. The published claim that the optimum is flat survives contact with this data, and 60
against 10 is not a difference this bench can defend.

The weights peak at 0.3 lexical and 0.7 dense on both collections, which is the same answer twice on
two unrelated subject areas. Against the shipped 0.4, that peak is worth +0.0063 on SciFact and
+0.0017 on NFCorpus, and both intervals contain zero. The arbitrary constant in this repository is
indistinguishable from the best value found by sweeping. It stays.

The warning: picking 0.3 because it peaked on these collections would be tuning on the collection the
result is then reported on, which is the mistake BEIR exists to prevent, and this project already
recorded the equivalent mistake once in `docs/plans/evaluation-corpus.md` section 12. The sweep is
usable as evidence that the curve is flat near the shipped value, not as a licence to move the value
to the peak.

### 7.2 Axis B, at each method's best

| Comparison | Dataset | Difference | 95 percent interval |
|---|---|---|---|
| `parallel-weighted-30` over `parallel-rrf-k10` | SciFact | +0.0150 | [0.0022, 0.0280] |
| `parallel-weighted-30` over `parallel-rrf-k10` | NFCorpus | -0.0064 | [-0.0162, 0.0022] |

Even at each method's best setting the two collections disagree: weighted fusion wins on SciFact, and
on NFCorpus the interval contains zero with rank fusion nominally ahead. Axis B stays undecided, and
that is the finding rather than a gap in it. Two fusion methods that cannot be separated on two
collections are not the place to spend the next week.

What changes for the product is only this: nothing. The shipped weights are already at the flat part
of the curve, and the choice between the two fusion methods is below what this bench can resolve.

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
