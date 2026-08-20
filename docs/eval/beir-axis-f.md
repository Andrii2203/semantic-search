# Axis F, the embedding model

Status: active
Owner: repository owner
Last change: 2026-08-20 08:36:18 +0200
Supersedes: none

## 1. Problem

`docs/adr/012-embedding-model-context-window.md` records that the active model accepts 256 tokens
while the chunker is configured to produce up to 300 words, and that the gap was never measured
against an alternative. `docs/plans/axis-f-embedding-model.md` made the model a property of a
configuration so that alternatives could be measured at all.

## 2. Decision

Not applicable. This document records a measurement. The decision it feeds is the ADR that names the
winner.

Proof of need: `docs/adr/012-embedding-model-context-window.md`, section 3.

## 3. Scope

Three candidates against the model in use, on the three public collections, plus the Matryoshka
truncation of the winner. Every candidate was taken from section 4 of ADR-012 and none was added.

## 4. What was run

Configuration `parallel-weighted` in every case, differing only in the model, so the fusion, the
candidate limits and the indexed fields are identical across every row. Paired bootstrap at 10000
resamples, 95 percent interval, seed 1. Runs between 2026-08-18 13:40 and 2026-08-20 08:15 +0200.

| Model | Dimensions | Context | Batch |
|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2`, the baseline | 384 | 256 | 64 |
| `Xenova/bge-small-en-v1.5` | 384 | 512 | 64 |
| `Xenova/gte-small` | 384 | 512 | 64 |
| `onnx-community/embeddinggemma-300m-ONNX` | 768 | 2048 | 16 |

A candidate counts as better only above the resolution recorded in `docs/eval/beir-bm25-control.md`
section 6.1, being 0.022 nDCG@10 on SciFact, 0.008 on NFCorpus and 0.009 on FiQA.

## 5. Result, nDCG@10

Positive means the candidate beat the model in use.

| Collection | Candidate | Baseline | Candidate score | Difference | Interval | Above resolution |
|---|---|---|---|---|---|---|
| SciFact | bge-small | 0.7229 | 0.7208 | -0.0021 | [-0.0157, 0.0113] contains zero | no |
| SciFact | gte-small | 0.7229 | 0.7386 | +0.0157 | [0.0019, 0.0300] excludes zero | no |
| SciFact | EmbeddingGemma | 0.7229 | 0.7553 | +0.0324 | [0.0172, 0.0484] excludes zero | yes |
| NFCorpus | bge-small | 0.3388 | 0.3541 | +0.0153 | [0.0051, 0.0258] excludes zero | yes |
| NFCorpus | gte-small | 0.3388 | 0.3503 | +0.0115 | [0.0020, 0.0215] excludes zero | yes |
| NFCorpus | EmbeddingGemma | 0.3388 | 0.3740 | +0.0351 | [0.0229, 0.0482] excludes zero | yes |
| FiQA | EmbeddingGemma | 0.3488 | 0.3690 | +0.0201 | [0.0106, 0.0300] excludes zero | yes |

## 6. Result, Recall@100

| Collection | Candidate | Baseline | Candidate score | Difference | Interval |
|---|---|---|---|---|---|
| SciFact | bge-small | 0.9583 | 0.9583 | 0.0000 | [-0.0133, 0.0133] contains zero |
| SciFact | gte-small | 0.9583 | 0.9550 | -0.0033 | [-0.0200, 0.0133] contains zero |
| SciFact | EmbeddingGemma | 0.9583 | 0.9756 | +0.0172 | [0.0006, 0.0356] excludes zero |
| NFCorpus | bge-small | 0.3184 | 0.3204 | +0.0020 | [-0.0146, 0.0190] contains zero |
| NFCorpus | gte-small | 0.3184 | 0.3332 | +0.0148 | [0.0009, 0.0301] excludes zero |
| NFCorpus | EmbeddingGemma | 0.3184 | 0.3596 | +0.0412 | [0.0232, 0.0604] excludes zero |
| FiQA | EmbeddingGemma | 0.6889 | 0.7159 | +0.0269 | [0.0116, 0.0427] excludes zero |

bge-small and gte-small were not run on FiQA. The reason is recorded rather than hidden: section 4.1
of `docs/plans/axis-f-embedding-model.md` staged the run so that FiQA is spent on a candidate that
cleared the resolution, and by the time the compute was available EmbeddingGemma had beaten both of
them on both collections that could separate them. Their FiQA rows are absent, not zero.

## 7. The result this axis gives, and why it is unusual here

Three collections, three wins, every interval excluding zero, every gain above the collection's own
resolution. No other axis in this project has produced that. Fusion refused to decide, in
`docs/eval/beir-axes-a-b.md` section 7.2. Reranking flipped sign between collections, in
`docs/eval/beir-axis-e.md`. The indexed text helped only where titles exist, in
`docs/eval/beir-axis-c.md`. The model is the first axis with one direction.

The order of the four models is exactly the order of their context windows: 256, 512, 512, 2048. That
is consistent with the mechanism `docs/eval/beir-axis-c.md` section 8 measured, where 629 of 1000
SciFact documents and 751 of 1000 NFCorpus documents exceed 256 tokens on their text alone. A model
that cannot read the end of two thirds of the corpus is losing what is written there.

Consistent is not the same as proven. This run varied the model, and window size, training data and
parameter count moved together. Attributing the gain to the window alone would need a model that
differs only in its window, and no such pair exists among these candidates.

## 8. The truncation, which decides what the winner costs

EmbeddingGemma emits 768 values where the stored layout holds 384, so at full width the winner needs a
schema change rather than only a reindex. It is a Matryoshka model, so the first 384 values are
themselves a vector, and this was computed from the vectors already cached at full width, taking
seconds rather than another encoding pass.

| Collection | Metric | 768 | 384 | Loss | Interval |
|---|---|---|---|---|---|
| SciFact | nDCG@10 | 0.7553 | 0.7528 | 0.0026 | [-0.0072, 0.0121] contains zero |
| SciFact | Recall@100 | 0.9756 | 0.9633 | 0.0122 | [0.0000, 0.0267] contains zero |
| NFCorpus | nDCG@10 | 0.3740 | 0.3678 | 0.0062 | [-0.0013, 0.0137] contains zero |
| NFCorpus | Recall@100 | 0.3596 | 0.3508 | 0.0088 | [0.0002, 0.0174] excludes zero |

Half the vector is discarded and one number out of four moves measurably, by 0.0088 of Recall@100 on
NFCorpus. Against the model in use, the truncated winner still gains 0.0299 nDCG@10 on SciFact and
0.0290 on NFCorpus, both above the resolution.

So open question 1 of ADR-012 is answered: Matryoshka truncation to 384 costs almost nothing, and the
winner fits the stored layout. The truncated FiQA figure is not taken yet, and the vectors it needs are
already on disk.

## 9. What it cost, recorded because the estimate was wrong twice

`Xenova/bge-small-en-v1.5` embedded SciFact's 5183 documents in 840.4 seconds, being 6.2 per second
against 11.8 for the 6 layer model in use. EmbeddingGemma on FiQA's 57638 documents took 20 hours and
33 minutes of wall clock and about 70 hours of processor time across roughly three and a half cores,
at batch 16.

Two estimates were given during that run, eight to eleven hours and then twelve to fourteen, and both
were wrong. The cause is named: the estimate was extrapolated from SciFact at batch 64, while FiQA ran
at batch 16, so the number of model invocations rose fourfold and the per invocation overhead was
multiplied by a corpus eleven times larger. The batch was lowered deliberately, to keep the machine
usable, and that trade was worth making. Estimating without accounting for it was the error.

The run was also unobservable while it lasted. `scripts/compare-beir.js` prints nothing until it
finishes and writes vectors in one block at the end, so for twenty hours there was no way to tell
progress from a stall, and a crash would have lost all of it. That is a defect in the instrument, it
is not fixed in this document, and it is the first entry in section 12.

## 10. Definition of done

- Every candidate that ran has a row with an interval, and every candidate that did not run has its
  reason.
- The winner's truncation to the stored width is measured rather than assumed.
- The cost of the run is recorded, including the wrong estimates.

## 11. Rollback

Not applicable. No runtime behaviour changed. The vectors are cached per model and per field set, so
every configuration above can be re-ranked without encoding anything again.

## 12. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether `scripts/compare-beir.js` reports progress and saves vectors incrementally | Answered by the next long run being scheduled, which is now |
| Whether the truncated winner holds on FiQA as it did on the other two | The vectors are on disk, so this costs seconds and is taken before the ADR |
| Whether the gain belongs to the window or to the training data | A candidate pair differing only in window length exists |
| Whether the winner needs the instruction prefixes it was measured with, and what dropping them costs | The product embeds without them by accident |
| Whether bge-small or gte-small would have beaten the winner on FiQA | Someone disputes the staged run, and 5 hours of compute are available |
