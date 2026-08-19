# Axis F, the embedding model

Status: active
Owner: repository owner
Last change: 2026-08-18 12:38:13 +0200
Supersedes: none

## 1. Problem

The model cannot read the chunks this system produces, and every number this project has published was
produced by that model.

`docs/adr/012-embedding-model-context-window.md` section 1 states the defect: `Xenova/all-MiniLM-L6-v2`
accepts 256 tokens while `chunkMaxWords` is 300. The ADR computes 390 tokens from the repository's
`tokensPerWord` of 1.3. That figure is now known to be low. Measured at 2026-08-18 11:05 +0200 with
the model's own tokeniser and recorded in `docs/eval/beir-axis-c.md` section 8, SciFact runs at 1.54
tokens per word, which puts a 300 word chunk at about 462 tokens against a 256 token window.

The same measurement showed the truncation is not a corner case. On 1000 SciFact documents, 629
exceed the window on their text alone, and on NFCorpus 751 do. Axis C then found that prepending a
title wins even though it evicts 22 more tokens of body, which says the tail being lost is worth less
than what replaces it, and says nothing about what a model that could read the tail would do.

The harness cannot answer that today. `src/eval/embedder.js` line 14 loads the model named in
`src/search-constants.js` and nothing else, so a second model cannot be measured without editing a
constant, and the cache would then be keyed by a model name that changed underneath it. Phase 5 fixed
the same shape of defect for the indexed text. This is the other half of it.

## 2. Decision

The embedding model becomes a property of a configuration rather than a constant of the repository,
the vector cache is keyed by the model as well as by the field set, and the candidates already chosen
in `docs/adr/012-embedding-model-context-window.md` section 4 are measured against the current model on
the English public collections with a paired bootstrap.

Proof of need: `docs/adr/012-embedding-model-context-window.md`, which is accepted and records why
this axis cannot be dropped. This document does not reopen that decision, it executes it.

## 3. Scope

In scope:
- The model as a named property of a configuration, with its facts recorded: dimensions, context
  window, and any instruction prefix it requires.
- The vector cache keyed by the model and the field set together.
- Instruction prefixes applied per side, because `docs/adr/012-embedding-model-context-window.md`
  section 4 records that EmbeddingGemma requires a different prefix for a query than for a document
  and that applying one side only is a silent quality defect.
- One report in `docs/eval/`, per candidate, per collection, with intervals.

Out of scope, each with its reason:
- The product reindex, the `chunks` model column and the migration that carries it. They are product
  code, and this project ships winners under their own document, which is the rule
  `docs/eval/beir-axes-a-b.md` section 12 set, `docs/plans/local-reranker.md` followed and
  `docs/plans/axis-c-indexed-text.md` followed again. Lines 1 and 4 of the definition of done of
  ADR-012 belong to that document, and this one covers lines 2, 3 and 5.
- Lowering `chunkMaxWords` to fit 256 tokens, because ADR-012 section 6 already records that doing so
  would change the chunking every number in `docs/eval/` was measured on, and axis C owns chunk
  construction.
- Multilingual quality, which `docs/plans/retrieval-quality.md` section 5 puts out of scope and
  ADR-012 section 0 removed from this axis by name.
- Asymmetric query and document modes as an axis of their own. They are open question 3 of ADR-012
  and are measured only if the winner supports them.

## 4. The candidates, and what decides between them

Taken from `docs/adr/012-embedding-model-context-window.md` section 4, which read each model card
between 10:55 and 11:10 +0200 on 2026-08-15. This document adds no new candidate and verifies each
card again at the moment it runs.

| Model | Dimensions | Context | Covers 462 tokens | Prefixes |
|---|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2`, the baseline | 384 | 256 | no | none |
| `Xenova/bge-small-en-v1.5` | 384 | 512 | yes | none for documents, a query instruction is optional in the card |
| `Xenova/gte-small` | 384 | 512 | yes | none |
| `onnx-community/embeddinggemma-300m-ONNX` | 768, truncatable to 384 | 2048 | yes | required, and different per side |

A candidate must clear the bench's own resolution to count as better, which
`docs/eval/beir-bm25-control.md` section 6.1 measures at 0.022 nDCG@10 on SciFact, 0.008 on NFCorpus
and 0.009 on FiQA. A gain smaller than that is not a gain this instrument can see.

## 4.1 The run is staged, and the reason is compute

Decided at 2026-08-18 14:05 +0200, after the first candidate produced a measured throughput rather
than an estimated one. `Xenova/bge-small-en-v1.5` embedded SciFact's 5183 documents in 840.4 seconds,
which is 6.2 per second, against the 11.8 per second the current 6 layer model managed on FiQA on
2026-08-14. Twelve layers cost twice the time, which is expected and is not a finding.

At that rate FiQA's 57638 documents cost about 2.6 hours per candidate, and EmbeddingGemma at 300
million parameters costs multiples of that again. Three candidates on all three collections is a day
of compute for numbers that, on the evidence of the first candidate, may all sit inside the bench's
resolution.

So candidates are screened on SciFact and NFCorpus first, and FiQA is run only for a candidate that
clears the resolution on at least one of them. This is written down rather than done quietly, because
a report that silently omits a collection is the kind of thing this project treats as a defect. Any
candidate whose FiQA row is absent from `docs/eval/beir-axis-f.md` carries the reason in its own row.

## 5. Behaviours

1. A configuration names the embedding model it is measured on, and the harness reports that model in
   its result, so a number cannot be read without the model that produced it.
2. The vector cache file name contains the model and the field set, so two models never read each
   other's vectors.
3. The harness tells the embedder which side it is embedding, a document or a query.
4. A model that requires instruction prefixes produces a different string for a document than for a
   query, and a model that requires none receives the text unchanged.
5. Every candidate carries its dimensions and its context window in one table, and that table says
   whether the window covers `chunkMaxWords` at a given tokens per word.
6. The model facts lookup refuses a model it has no facts for, and names the models it knows.
7. The batch the embedder sends comes from the model's own facts, and a model that declares none is
   embedded at `embeddingBatchSize`.
8. A vector truncated to a shorter width keeps its first values and is renormalised to unit length,
   and a width at or above the model's own leaves the vector untouched.
9. A configuration reports the vector width it ranked at, and a configuration that truncates reports
   the shorter one.

## 6. Tests

| # | Level | File |
|---|---|---|
| 1 | L2 | `__tests__/eval/harness.test.js` |
| 2 | L1 | `__tests__/eval/embedder.test.js` |
| 3 | L2 | `__tests__/eval/harness.test.js` |
| 4 | L1 | `__tests__/eval/models.test.js` |
| 5 | L1 | `__tests__/eval/models.test.js` |
| 6 | L1 | `__tests__/eval/models.test.js` |
| 7 | L1 | `__tests__/eval/models.test.js` |
| 8 | L1 | `__tests__/eval/models.test.js` |
| 9 | L2 | `__tests__/eval/harness.test.js` |

Behaviours 8 and 9 answer open question 1 of `docs/adr/012-embedding-model-context-window.md` and they
cost no embedding. EmbeddingGemma is a Matryoshka model, so the first 384 values of its 768 wide vector
are themselves a usable vector, and the truncated configuration is computed from the vectors already
cached at full width rather than by encoding the corpus again. The truncation applies to the query as
well as to the document, because a similarity between vectors of two widths is not a similarity at all.

Behaviour 7 was added at 2026-08-18 17:30:31 +0200, and the trigger was the machine rather than the
bench. EmbeddingGemma held 8.7 gigabytes of resident memory while it embedded SciFact at the shared
batch of 64, which is enough to make the computer unusable for anything else. Batch size decides how
many documents are in flight at once, so it is a property of the model rather than of the repository,
and a model of 300 million parameters has no business being fed at the batch a model of 22 million
tolerates.

The measurement is untouched by it. Each document is encoded independently, mean pooling is taken
under the attention mask, so a vector does not depend on the batch it travelled in. That is what
separates this lever from quantisation, which would also save memory and would change every number,
making the runs already taken incomparable. Quantisation is therefore not used.

No test loads a model. Behaviours 1 and 3 run through the injected embedder the harness already
accepts, and the rest read a table or a file name.

## 7. Definition of done

- Every behaviour in section 5 has a passing test.
- `npm run verify` is green.
- `docs/eval/beir-axis-f.md` exists and reports every candidate against the baseline, per collection,
  with a paired bootstrap interval, and states which candidates cleared the resolution in section 4.
- The truncation measurement of 2026-08-13, a 520 word input embedding identically with and without an
  appended sentence, is repeated on the winner and recorded whether or not it still reproduces.
- Any candidate whose card disagrees with the table in section 4 is corrected in this document, with
  the moment the card was read.

## 8. Rollback

| If | Action | Time |
|---|---|---|
| No candidate clears the bench resolution | The current model stays, the axis closes with that recorded, and the truncation defect moves to axis C as a chunk size question. This is ADR-012 section 8 row 1 | 1 hour |
| A candidate cannot load in this runtime | It leaves the table with the error recorded. The other candidates are unaffected, because the model is per configuration | minutes |
| The cache key change makes an existing run unreproducible | Phase 5 already renamed the caches by field set. This adds the model to the same name, so the existing files are renamed once more and the check is the same: re-run `parallel-weighted` and compare against 0.7229 on SciFact | 20 minutes |

## 9. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether Matryoshka truncation to 384 costs measurable quality, which is what would let a 768 dimension model reindex without a schema change | EmbeddingGemma wins at full width |
| Whether the winner is measured with axis C's title decision applied, since the two interact through the window | The title ships in the product |
| Whether `tokensPerWord` is replaced by the tokeniser before the winner reindexes, since the chunker's skip decision uses it | The winner is chosen and the reindex is planned |
