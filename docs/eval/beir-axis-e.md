# Axis E, reranking

Status: active
Owner: repository owner
Last change: 2026-08-17 18:15:34 +0200
Supersedes: none

## 1. Problem

`docs/adr/003-reranking-strategy.md` chose language model reranking on Groq and rejected a local cross
encoder as slow and heavy. Nothing in that file is a number. It also wrote its own revisit trigger,
"if offline is needed, a cross encoder model", and that trigger has since fired without anyone
noticing: the Groq model named in `src/config.js` no longer exists and no key is configured, so the
reranking the product ships cannot run at all.

Axis E of `docs/reference/retrieval-in-industry.md` section 7 lists three options: none, language model
scoring, cross encoder. The language model option is unavailable for the reason above, so this run
measures none against a cross encoder.

## 2. Decision

Not applicable. This document records a measurement. The decision it feeds is
`docs/adr/020-reranking-runs-locally-and-stays-off-by-default.md`.

Proof of need: phase 4 of `docs/plans/retrieval-quality.md`, and the trigger ADR-003 wrote for itself.

## 3. Scope

In scope:
- `parallel-weighted`, the fusion this repository ships, against the same configuration with a cross
  encoder reordering its top 50.
- SciFact, NFCorpus and FiQA-2018, plus the local news bench, on nDCG@10 and Recall@100.
- A check of every reranked number against the published BM25+CE figure for the same collection.

Out of scope, each with its reason:
- Language model reranking, because no key exists and the configured model does not.
- Rerank depth as a swept parameter. One depth was affordable at 18 pairs per second, and the depth
  chosen is recorded with its reason in `docs/reference/search-constants.md`.
- Any change to the product. This document measures.

## 4. What was run

Model `Xenova/ms-marco-MiniLM-L-6-v2`, a 6 layer MiniLM cross encoder trained on MS MARCO, run
locally through `@huggingface/transformers`, which this repository already depends on. Raw logits are
read from the sequence classification head rather than through the text classification pipeline,
because that pipeline applies softmax over a single label and returns 1.0 for every pair, which would
have produced a silent identity reranker.

Depth 50, batch 16, measured at 17.8 to 18.8 pairs per second on this machine. Roughly 63 thousand
pairs over the three public collections, run 2026-08-17 between 17:12:51 and 18:11 +0200, on the
vectors cached on 2026-08-14. Clock read at 2026-08-17 18:15:34 +0200.

## 5. Result

| Comparison | Dataset | Metric | Base | Reranked | Difference | 95 percent interval |
|---|---|---|---|---|---|---|
| `parallel-weighted` against `parallel-weighted-reranked` | SciFact | nDCG@10 | 0.7229 | 0.6899 | +0.0330 for the base | [0.0058, 0.0599] |
| | NFCorpus | nDCG@10 | 0.3388 | 0.3528 | +0.0140 for the reranker | [-0.0280, -0.0003] |
| | FiQA | nDCG@10 | 0.3488 | 0.3647 | +0.0158 for the reranker | [-0.0326, 0.0005] |
| | local news | nDCG@10 | 0.4581 | 0.5400 | +0.0819 for the reranker | [-0.2222, 0.0654] |

Recall@100 is identical to four decimals on all four benches, which is behaviour 33 of
`docs/plans/public-benchmark.md` holding by construction: a stage that reorders inside the recall
cutoff cannot change what is inside it.

Two intervals exclude zero and they point in opposite directions. On SciFact the reranker loses more
than that collection can attribute to noise, its resolution being 0.022. On NFCorpus it wins by more
than that collection's resolution of 0.008. On FiQA it wins by 0.0158 against a resolution of 0.009
with an interval that just touches zero, and the base configuration wins in 2.8 percent of resamples.

## 6. Why the sign flips, and it is not a coincidence

The published BM25+CE figures, read from Table 2 of the BEIR paper at
https://ar5iv.labs.arxiv.org/html/2104.08663 on 2026-08-17 18:12 +0200. The paper's reranker is a 6
layer 384 hidden MiniLM cross encoder trained on MS MARCO, reranking the top 100 of Anserini BM25,
which is the same model family as ours at half the depth over a different first stage.

| Collection | Published BM25 | Published BM25+CE | Our base | Our reranked |
|---|---|---|---|---|
| SciFact | 0.665 | 0.688 | 0.7229 | 0.6899 |
| NFCorpus | 0.325 | 0.350 | 0.3388 | 0.3528 |
| FiQA-2018 | 0.236 | 0.347 | 0.3488 | 0.3647 |

Every reranked number lands next to the published BM25+CE number for the same collection: 0.6899
against 0.688, 0.3528 against 0.350, 0.3647 against 0.347. Three collections, three matches within
0.018, with a different first stage and half the rerank depth.

That is the finding, and it is more useful than a winner. The cross encoder does not add a fixed
amount to whatever it is given. It pulls the top of the ranking towards its own quality on that
collection, and the first stage mostly stops mattering once it runs. So the sign of the change is
decided by one comparison: whether the first stage is already better than the reranker is.

| Collection | First stage against the reranker's own level | Effect |
|---|---|---|
| SciFact | 0.7229 above 0.688 | reranking loses 0.0330 |
| NFCorpus | 0.3388 below 0.350 | reranking wins 0.0140 |
| FiQA | 0.3488 above 0.347 by a hair | reranking wins 0.0158, interval touches zero |
| local news | 0.4581, no published level exists | reranking wins 0.0819, 8 topics, interval contains zero |

It also serves as a second planted control, in the sense of `docs/plans/public-benchmark.md` section 6.
A rerank stage written from scratch that lands within 0.018 of published numbers on three collections
is a stage that works. Had the softmax trap gone unnoticed, this table would have shown our reranked
column equal to our base column, and the cause would have been invisible in the metric.

## 7. What this does not say

It does not say the cross encoder is better than language model reranking, because that comparison
cannot be run here.

It does not say reranking is worth its latency in the product. Eighteen pairs per second means
reranking twenty results costs about a second, against a search that currently answers in tens of
milliseconds, and no measurement here weighs a second of latency against 0.014 of nDCG@10.

It does not decide the axis globally, and that is the second collection pair in this project to
refuse a global answer, after axis B. What it decides is narrower and firmer: on any corpus where the
current ranking is weaker than a MS MARCO cross encoder, reranking helps, and the way to know is to
measure that corpus rather than to argue from this table.

## 8. Behaviours

Not applicable, this document records a measurement. The behaviours exercised are 30 to 33 of
`docs/plans/public-benchmark.md`.

## 9. Tests

Not applicable, for the same reason. The rerank stage is pinned by `__tests__/eval/rerank.test.js`
with an injected scorer, so those tests need no model.

## 10. Definition of done

- Four benches ran both configurations and every number is above.
- Every comparison carries an interval rather than a point value.
- Every reranked number is placed next to the published figure for the same collection.
- The mechanism behind the sign flip is stated as a mechanism, with the table that shows it.

## 11. Rollback

Not applicable. No runtime behaviour changed.

## 12. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether rerank depth beyond 50 keeps improving the result | A collection where reranking wins and the gain is worth an hour of compute to confirm at depth 100 |
| Whether the second of latency is acceptable in the product | Reranking is proposed as a default rather than an option |
| Whether a cross encoder tuned on the product's own domain would beat the MS MARCO one | The interaction logs named in `docs/reference/retrieval-in-industry.md` section 8 exist |
| Whether the local news result holds | The evaluation corpus grows past 8 answerable intents in its dev split |
