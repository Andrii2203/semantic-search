# ADR-021: The embedding model becomes EmbeddingGemma, truncated to 384

Status: accepted
Owner: repository owner
Last change: 2026-08-20 17:06:14 +0200
Supersedes: the model half of `docs/adr/012-embedding-model-context-window.md`, which chose the
comparison rather than the winner

## 1. Problem

`Xenova/all-MiniLM-L6-v2` accepts 256 tokens and the chunker is configured to produce up to 300 words.
`docs/adr/012-embedding-model-context-window.md` recorded that as a defect measured on 2026-08-13, and
`docs/eval/beir-axis-c.md` section 8 later measured how wide it is: on 1000 SciFact documents 629
exceed the window on their text alone, on NFCorpus 751 do, and the real tokeniser reports 1.54 tokens
per word against the 1.3 the repository assumes, which puts a 300 word chunk at about 462 tokens.

ADR-012 chose the candidates and the shape of the comparison and stopped there, deliberately. The
comparison has now run.

## 2. Alternatives

All four were measured on the same three collections, in the same configuration, differing only in the
model. Numbers and intervals in `docs/eval/beir-axis-f.md`.

- Keep `Xenova/all-MiniLM-L6-v2`. Rejected: three candidates beat it and one beats it everywhere.
- `Xenova/bge-small-en-v1.5`, 512 tokens. Rejected: nothing on SciFact, and its NFCorpus gain is a
  third of the winner's.
- `Xenova/gte-small`, 512 tokens. Rejected: it wins on both collections it ran on, but its SciFact
  gain of 0.0157 is below that collection's resolution of 0.022, and the winner beats it on both.
- `onnx-community/embeddinggemma-300m-ONNX` at 768 dimensions. Rejected as the shipped width, not as
  the model, for the reason in section 4.
- The same model truncated to 384. Chosen.

## 3. Decision

The embedding model becomes `onnx-community/embeddinggemma-300m-ONNX`, and the vector stored is its
first 384 values, renormalised.

This decision names the model. It does not reindex anything: the migration, the model column on
`chunks` and the reindex belong to the document that ships it, which is the rule this project has
followed since `docs/eval/beir-axes-a-b.md` section 12.

Proof of need: `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes, and the 256 token
window against a 462 token chunk is a defect this repository measured twice.

## 4. Why 384 rather than 768

Because the loss is measured and it is not in the place that matters here.

| Collection | nDCG@10 lost by truncating | Recall@100 lost |
|---|---|---|
| SciFact | 0.0026, interval contains zero | 0.0122, interval contains zero |
| NFCorpus | 0.0062, interval contains zero | 0.0088, interval excludes zero |
| FiQA | 0.0014, interval contains zero | 0.0110, interval excludes zero |

Half the vector goes and the ranking does not move on any collection. Recall at depth 100 loses about
one point consistently, and on two collections that loss is real rather than noise.

The product shows `resultsReturned` results, which is 20, so the top of the ranking is what a person
sees. Against that, 768 buys about a hundredth of recall at a depth nobody reads, and costs a schema
change: `docs/reference/search-constants.md` section 4 records that the stored BLOB layout depends on
384.

The trigger that reopens this is written rather than implied: the product's answer starts depending on
a deep candidate list. `rerankDepth` is 50 today, inside the depth where this loss lives, so a
reranker turned on by default would be that trigger.

## 5. What the winner is worth

Against the model in use, at the shipped width of 384.

| Collection | nDCG@10 | Gain | Resolution | Above it |
|---|---|---|---|---|
| SciFact | 0.7528 against 0.7229 | +0.0299 | 0.022 | yes |
| NFCorpus | 0.3678 against 0.3388 | +0.0290 | 0.008 | yes |
| FiQA | 0.3675 against 0.3488 | +0.0187 | 0.009 | yes |

Three collections, three wins above each collection's own resolution. This is the first axis in this
project to give one direction: fusion refused to decide, reranking changed sign between collections,
and the indexed text helped only where titles exist.

One honest limit on the interpretation. The four models differ in window, training data and parameter
count at once, so the gain cannot be attributed to the window alone, however neatly the ranking of the
four follows the ranking of their windows. That question is open in
`docs/eval/beir-axis-f.md` section 12 with the pair of models that would settle it.

## 6. What it costs, and this is the uncomfortable half

The winner is thirteen times the parameters of the model it replaces, and the price shows up in three
places that a bench does not feel.

| Cost | Measured |
|---|---|
| Encoding speed | FiQA's 57638 documents took 20 hours 33 minutes and about 70 processor hours at batch 16, against 4871.9 seconds for the same corpus on the current model on 2026-08-14 |
| Memory | 8.7 gigabytes resident at batch 64, 5 gigabytes at batch 16, against a few hundred megabytes today |
| Instruction prefixes | The model requires one prefix on a document and a different one on a query, both recorded in `src/eval/models.js`. Applying one side only is a silent quality defect, and every number above was taken with both applied |

The consequence for the product is not the ingest cycle, which handles tens of items at a time. It is
the first reindex, which touches every chunk already stored, and the memory the host must have while
it runs. Both belong to the shipping document, and both are reasons that document is not this one.

## 7. Behaviours

Not applicable. This decision changes no runtime behaviour on its own. The behaviours that carry the
measurement are 1 to 9 of `docs/plans/axis-f-embedding-model.md`, and the behaviours that will carry
the product change belong to the document that ships it.

## 8. Definition of done

- The numbers in sections 4 and 5 exist in `docs/eval/beir-axis-f.md` with their intervals.
- Every candidate that was not run on a collection carries the reason there.
- `docs/adr/012-embedding-model-context-window.md` carries a status naming this file.
- The product change is written down as not done, with the document that will own it.

Three lines of ADR-012's own definition of done are met by this work and by
`docs/plans/axis-f-embedding-model.md`: each candidate ran with intervals, the window is asserted by
`coversChunk` in `__tests__/eval/models.test.js` rather than by reading a model card, and the
instruction prefixes are applied per side with a test that the two differ.

Two lines are not met and belong to the shipping document: every vector row carrying its model and
dimension, and the truncation measurement of 2026-08-13 repeated on the winner. The second one needs
the product path, because the measurement was taken there.

That document was written at 2026-08-20 17:06:14 +0200 and is
`docs/plans/embedding-model-in-the-product.md`. Behaviours 6, 12 and 15 of it carry the first line and
its definition of done carries the second. It ships the phase 5 title correction in the same work,
because both changes require re-embedding every stored chunk and running that twice buys nothing.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| The winner cannot load on the target host, for memory or for architecture | Nothing shipped yet. The model is one name in `src/eval/models.js` and the runner keeps working on the current model | minutes |
| The reindex proves too slow to finish on the target host | The vectors are cached per model, so the previous model's vectors remain valid and the product runs on them | 1 hour |
| Retrieval gets worse in the product despite the bench | The shipping document stores the model per vector, so both generations coexist and the switch is a setting rather than a migration | 1 hour |
| The prefixes are forgotten in the product path | The numbers here stop describing the product. A test on the embedding path asserting the two prefixes differ is required by the shipping document | 20 minutes |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether 768 returns once the product's answer depends on a deep candidate list | Reranking is turned on by default, at `rerankDepth` 50 |
| Whether `chunkMaxWords` rises now that the window is 2048 rather than 256, since the chunker was built around a limit that no longer applies | The winner ships and axis C is re-run on it |
| Whether `tokensPerWord` is replaced by the tokeniser before the reindex, given it is measured 18 percent low | The reindex is planned |
| Whether the local news bench agrees with the public collections about this winner | The bench's dev split grows past 8 answerable intents |
