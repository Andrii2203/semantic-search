# Local news bench, axis A

Status: active
Owner: repository owner
Last change: 2026-08-14 20:10:41 +0200
Supersedes: none

## 1. Problem

`docs/adr/008-parallel-candidate-generation.md` decided axis A on SciFact and NFCorpus: English
scientific claims and medical abstracts, both with real document bodies. It named its own hole in
section 5. This product ingests short news items and posts, in two languages, and nothing had checked
that the ordering survives that content.

The local bench is the only news evidence this project has, because
`docs/plans/public-benchmark.md` section 4 established that every news collection in BEIR requires a
licence rather than a download.

## 2. Decision

Not applicable. This document records a measurement.

Proof of need: the open question in `docs/adr/008-parallel-candidate-generation.md` section 7.

## 3. Scope

In scope:
- Five configurations over the dev half of the local bench, the same five the public bench ran.
- Paired bootstrap intervals for the comparison that decides axis A.

Out of scope:
- The locked half, which `docs/standards/EVALUATION_STANDARD.md` spends once, on a winner, and this
  is not that moment.
- The 26 unanswerable intents, which measure admission rather than ranking, and are counted here
  rather than scored.
- Ukrainian, which is a holdout and not in this corpus.

## 4. What was run

Dev half of `eval/intents.json` against 2509 articles from the 2026-08-13 snapshot, judged by the
answer key in `eval/judgments.json`. Vectors from the product's own model, computed once at 426.0
seconds for 2509 articles and cached. Runs at 2026-08-14 between 20:02 and 20:10 +0200.

The size of the bench, stated before its results, because it decides how much of them can be read:

| Quantity | Count |
|---|---|
| Articles | 2509 |
| Judged intents in the dev half | 34 |
| Answerable, having an article graded 2 or 3 | 8 |
| With no relevant article, left out of ranking metrics | 26 |

Eight queries. That is a quarter of what the control run had on its smallest public collection, and
`docs/plans/evaluation-corpus.md` section 12 already recorded why: the intents were sampled without
regard to whether the news corpus covers their subject.

## 5. Result

| Configuration | nDCG@10 | Recall@100 |
|---|---|---|
| `bm25-repository-defaults` | 0.3388 | 0.6828 |
| `dense-only` | 0.4556 | 0.8627 |
| `sequential-rescore`, what the product ships | 0.3649 | 0.6828 |
| `parallel-rrf` | 0.3767 | 0.9886 |
| `parallel-weighted-40` | 0.4581 | 1.0000 |

| Comparison | Metric | Difference | 95 percent interval |
|---|---|---|---|
| `parallel-rrf` over `sequential-rescore` | nDCG@10 | +0.0118 | [-0.0991, 0.1054] |
| `parallel-rrf` over `sequential-rescore` | Recall@100 | +0.3059 | [0.1146, 0.4905] |
| `parallel-rrf` over `dense-only` | Recall@100 | +0.1259 | [0.0114, 0.3229] |

## 6. What this bench can and cannot say

It cannot say anything about ranking quality. The nDCG@10 interval is 0.2 wide, which is ten times
the resolution of the public collections. With eight queries, no ordering of configurations by
nDCG@10 here means anything, and the apparent lead of the dense configurations must not be quoted.

It can say something about recall, and the answer is the same one the public bench gave, larger.
Parallel retrieval finds 0.3059 more of the relevant set than the sequential rescoring this product
ships, the interval excludes zero, and that is a 45 percent increase over what it retrieves today.
Weighted fusion reaches Recall@100 of 1.0000: every relevant article, for all eight intents, inside
the top hundred.

And the structural fact appears a third time, on a third collection, in a different language mix and
a different subject area. `sequential-rescore` and `bm25-repository-defaults` have identical
Recall@100, 0.6828, and the measured difference between them is exactly 0.0000 with an interval of
zero width. A rescoring stage cannot retrieve what the stage before it did not return. This is no
longer a hypothesis with supporting evidence, it is arithmetic that the bench keeps reproducing.

## 7. What this changes in ADR-008

The hole named in section 5 of that ADR is partly closed. On this product's own content, in the
metric this bench can resolve, parallel candidate generation wins by more than on either public
collection. The part that stays open is ranking quality on news, and it stays open for a reason that
is not about retrieval at all: there are eight usable topics.

## 8. Behaviours

Not applicable, this document records a measurement. The behaviours exercised are 27 to 29 of
`docs/plans/evaluation-corpus.md`.

## 9. Tests

Not applicable, for the same reason. The loader is pinned by `__tests__/eval/local-bench.test.js`.

## 10. Definition of done

- Five configurations ran over the dev half and every number is above.
- The size of the bench is stated before its results rather than after.
- The metric the bench cannot resolve is named as unresolvable instead of being ranked anyway.

## 11. Rollback

Not applicable. No runtime behaviour changed.

## 12. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether ranking quality on news follows the recall result | The bench reaches enough answerable intents to resolve nDCG@10. On these numbers that means roughly forty, against eight today |
| Whether the missing half of the bench is rebuilt by choosing intents whose subject the corpus covers | Already triggered on 2026-08-14 and recorded in `docs/plans/evaluation-corpus.md` section 12. It is now the single largest limit on every number this project produces |
| Whether Recall@100 of 1.0000 means the task is too easy rather than the configuration too good | Eight intents against 2509 articles is a small haystack. The trigger is a corpus of ten thousand articles, which more snapshot days would give for free |
