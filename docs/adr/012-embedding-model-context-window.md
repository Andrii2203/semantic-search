# ADR-012: The embedding model is measured on axis F, because its window truncates the chunks this system produces

Status: accepted
Owner: repository owner
Last change: 2026-08-15 14:51:56 +0200
Supersedes: none

## 0. What this file said this morning, and why it was wrong

Written at 2026-08-15 11:10:48 +0200 as "Ukrainian becomes a supported language, so the embedding
model changes". Rewritten at 14:51:56 +0200 with the Ukrainian half removed entirely.

The cause was a misreading, and it is recorded because the same mistake is easy to repeat. The
repository owner listed three things to stop working with in one sentence: the built in sources, the
hardcoded cutoff, and Ukrainian. The first two were read as decisions and the third was read as a
complaint, which turned "we are not doing this" into an ADR that made it a supported language with a
bench of its own.

What is deleted with it: Ukrainian as a measurement target, the Ukrainian bench, the Ukrainian
holdout run of `docs/plans/retrieval-quality.md` section 5, and every multilingual argument for a
model. Section 5 of that plan stands exactly as it was written, English is the measurement language,
and Ukrainian is out of scope rather than held out for later.

What survives has nothing to do with language, and it is the whole of this ADR now.

## 1. Problem

The model cannot read the chunks this system gives it.

`Xenova/all-MiniLM-L6-v2` accepts 256 tokens. `chunkMaxWords` is 300, which at the repository's own
`tokensPerWord` of 1.3 is 390 tokens. So the chunker is configured to produce inputs half again
longer than the encoder accepts, and everything past the limit is dropped rather than reported.

Measured on 2026-08-13 with this repository's code and recorded in
`docs/reference/search-constants.md` section 4: a 520 word English input embeds identically with and
without a decisive sentence appended at its end. The vector cannot distinguish two documents that
differ only after the cutoff.

This is an English defect. It was already true before any argument about a second language, and it
stays true now that the second language is out of scope.

Two consequences follow that reach every number this project has produced. Any chunk over roughly
200 words is scored on its head alone, which is most of what the article corpus contains, since
`docs/plans/evaluation-corpus.md` section 4 records a median of 126 words per article and a maximum
of 322. And a retrieval failure caused by truncation is indistinguishable, in every report in
`docs/eval/`, from a retrieval failure caused by the configuration under test.

## 2. Decision

Axis F stays exactly where `docs/plans/retrieval-quality.md` section 6 puts it, phase 6, after the
axes that are pure configuration. This ADR does not move it and does not promote it.

What this ADR adds is the reason it is not optional and the shape of the comparison: candidate models
are compared on the English public collections of `docs/plans/public-benchmark.md`, and the first
property any candidate must have is a context window that covers `chunkMaxWords` at
`tokensPerWord`.

The model identifier and the vector dimension are stored per vector before any reindex, so two models
can coexist while the comparison runs.

## 3. Proof of need

Not required. `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes, and a chunker
configured to exceed its own encoder's input limit is a defect measured on 2026-08-13.

The axis itself needs no proof of need either. It is one of the six in
`docs/reference/retrieval-in-industry.md` section 7 and phase 6 of the active plan, so it is already
decided work. This ADR records why it cannot be quietly dropped, which is a different thing from
arguing for it.

## 4. The candidates

Read on 2026-08-15 between 10:55 and 11:10 +0200. The clock was read once at 11:10:48 +0200 and these
stamps are fitted backwards into that window, per `docs/standards/DOCUMENT_TEMPLATE.md`. They are
correct to within about fifteen minutes and in the right order, and they are not to the second.

| Model | Dimensions | Context | Covers 390 tokens | Runs in this stack | License | Source |
|---|---|---|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2`, in use today | 384 | 256 | no | yes | Apache 2.0 | the baseline, not a candidate |
| `Xenova/all-MiniLM-L12-v2` | 384 | 256 | no | yes, ONNX | Apache 2.0 | same family, listed to be rejected on the same ground |
| `Xenova/bge-small-en-v1.5` | 384 | 512 | yes | yes, ONNX | MIT | Hub model index, read 2026-08-15 11:05 +0200 |
| `Xenova/gte-small` | 384 | 512 | yes | yes, ONNX | MIT | same read |
| `onnx-community/embeddinggemma-300m-ONNX` | 768, truncatable to 512, 256 or 128 by Matryoshka | 2048 | yes, with room | yes, built for Transformers.js | Apache 2.0 | https://huggingface.co/blog/embeddinggemma read 2026-08-15 11:02 +0200 |

The three 384 dimension candidates matter for a reason beyond quality:
`docs/reference/search-constants.md` section 4 records that the stored BLOB layout depends on 384, so
a winner at that width reindexes without a schema change. EmbeddingGemma changes the width, and its
Matryoshka truncation to 384 is the thing to measure before assuming it does not.

EmbeddingGemma also requires instruction prefixes, `task: search result | query: ` for a query and
`title: none | text: ` for a document, from the source read at 2026-08-15 11:02 +0200. A prefix
applied on one side only is a silent quality defect, so it belongs in the embedding path next to the
model identifier.

## 5. What decides it

The English public collections, with the resolution already measured in
`docs/eval/beir-bm25-control.md` section 6.1: 0.022 nDCG@10 on SciFact, 0.008 on NFCorpus, 0.009 on
FiQA. A candidate that does not clear that against the current model has not been shown to be better.

Re-embedding is no longer the obstacle it was. FiQA cost 4871.9 seconds on CPU on 2026-08-14, and
`docs/adr/013-local-inference-on-the-gpu.md` puts that work on the GPU, so the axis costs compute and
no human time. It needs no judge, no key and no new answer key, which is what separates it from every
other open piece of work in this repository.

## 6. Consequences

The 256 token defect closes as a side effect of any candidate winning, because every candidate above
carries at least 512.

Until it closes, `chunkMaxWords` at 300 is a setting the encoder cannot honour. That is recorded here
rather than fixed here, because lowering it to fit 256 tokens would change the chunking that every
number in `docs/eval/` was measured on, and axis C owns chunk construction.

Every measurement in `docs/eval/` is a measurement of the current model and stays valid as such. The
baseline remains runnable, which is what makes the comparison a comparison.

## 7. Definition of done

- Every vector row carries the model identifier and the dimension that produced it.
- Each candidate ran over SciFact, NFCorpus and FiQA with intervals, and the table is in `docs/eval/`.
- The winner's context window covers `chunkMaxWords` multiplied by `tokensPerWord`, asserted by a
  test rather than by reading a model card.
- The truncation measurement of 2026-08-13 is repeated on the winner and no longer reproduces.
- Any required instruction prefix is applied in the embedding path, with a test asserting the query
  prefix and the document prefix differ.

## 8. Rollback

| If | Action | Time |
|---|---|---|
| No candidate clears the bench's resolution on English | The current model stays and the axis is closed with that result recorded. The truncation defect then moves to axis C as a chunk size question | 1 hour |
| The winner degrades retrieval after reindexing | Model identifier and dimension are stored per vector, so the old vectors stay valid. Reindex back | 1 hour |
| The winner changes the vector width | Only EmbeddingGemma does, and its Matryoshka truncation to 384 is measured before the width is accepted | measured, not guessed |

## 9. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether `chunkMaxWords` should drop to fit 256 tokens in the meantime, or wait for the model | Axis C runs, or a report is found to have been decided by truncation |
| Whether Matryoshka truncation to 384 costs measurable quality, which is what would let a 768 dimension model reindex without a schema change | EmbeddingGemma wins on full width |
| Whether asymmetric query and document modes, recorded at DoorDash in `docs/reference/retrieval-in-industry.md`, beat symmetric embedding here | The winner supports both modes |
