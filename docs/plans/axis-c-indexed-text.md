# Axis C, the indexed text

Status: active
Owner: repository owner
Last change: 2026-08-18 10:07:45 +0200
Supersedes: none

## 1. Problem

Axis C is the axis with the largest published gains and it has never been measured here.
`docs/reference/retrieval-in-industry.md` section 8.4 records the reason to expect that: Anthropic
prepends 50 to 100 tokens of generated document context and its top 20 failure rate falls from 5.7 to
3.7 percent, and DoorDash reports roughly 31 percent from generated entity profiles against roughly 6
percent from upgrading the embedding model. That section closes on the cheapest option: prepending
the document title costs no model call and has never been measured in this repository.

Two things stand in the way of measuring it, and both were found on 2026-08-18 by reading the code
rather than by running it.

The bench cannot vary the indexed text without corrupting its own numbers. Every configuration in
`src/eval/harness.js` carries `fields`, being `['title', 'text']`, and both branches honour it:
`src/eval/retrieval.js` line 29 builds the lexical index from those fields and
`src/eval/harness.js` line 173 embeds the same join. But the cache the embeddings are written to is
named by the dataset and the model alone, in `src/eval/embedder.js` line 51, so a second configuration
that indexes different text reads back the first one's vectors. The two configurations would then
differ only in their lexical branch, the dense branch would silently be identical, and the difference
reported would be a fraction of the real one. Nothing has failed yet because every configuration ever
run used the same two fields.

The product and the bench do not index the same text. `src/scheduler.js` line 109 chunks
`item.content`, and the title lives in `item.metadata.title`, which no chunk ever contains. So the
product runs option 1 of this axis, the raw chunk, while every number this project has published from
BEIR was measured on option 2, the chunk with its title. That is not a defect in either one, it is a
difference that was never written down, and it means the public numbers describe a system slightly
better than the one that ships.

## 2. Decision

The cache is keyed by the text it holds, the two cheap options of axis C become named configurations,
and the pair is measured on the three public collections with a paired bootstrap. FiQA carries no
titles, which makes it the control: the axis must move nothing there, and a number other than zero on
FiQA is a defect in the instrument rather than a finding about the axis.

Proof of need: `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes, and the cache key
is a defect that would corrupt a measurement. The axis itself is authorised by
`docs/plans/retrieval-quality.md` section 6, which schedules it as phase 5.

## 3. Scope

In scope:
- The vector cache keyed by the field set the configuration indexes.
- Two configurations per branch shape: the current title and text, and text alone.
- One report in `docs/eval/`, on SciFact, NFCorpus and FiQA, with intervals.
- The mismatch between what the product indexes and what the bench indexes, recorded with its number.

Out of scope, each with its reason:
- The third option of axis C, generated document context, because it costs one language model call per
  document and 57638 of them on FiQA alone. It is decided after the cheap option has a number, which
  is the order `docs/reference/retrieval-in-industry.md` section 8.4 implies.
- Changing what the product indexes, because this phase measures and the winner ships under its own
  document, which is the rule `docs/eval/beir-axes-a-b.md` section 12 set and
  `docs/plans/local-reranker.md` followed.
- Chunk size, overlap and strategy. They decide the chunk, not what goes into it, and
  `docs/reference/search-constants.md` already holds their triggers.
- The local news bench, because its dev split has 8 answerable intents and
  `docs/plans/retrieval-quality.md` section 6.6 records that as too few to carry a result. It is run
  once the corpus grows.

## 4. Behaviours

1. The vector cache file name contains the field set the configuration indexes.
2. Two configurations that index different field sets never read each other's vectors.
3. Two configurations that index the same field set share one cache file.
4. `parallel-weighted-text-only` differs from `parallel-weighted` in its fields and in nothing else.
5. `bm25-text-only` differs from `bm25-repository-defaults` in its fields and in nothing else.
6. A term that appears only in a document's title retrieves that document under `parallel-weighted`
   and does not under `parallel-weighted-text-only`, and the text the dense branch embeds carries no
   title under the second. Both branches therefore honour the field set, which is what the axis
   varies.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/eval/embedder.test.js` |
| 2 | L1 | `__tests__/eval/embedder.test.js` |
| 3 | L1 | `__tests__/eval/embedder.test.js` |
| 4 | L1 | `__tests__/eval/harness.test.js` |
| 5 | L1 | `__tests__/eval/harness.test.js` |
| 6 | L2 | `__tests__/eval/harness.test.js` |

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run verify` is green.
- `docs/eval/beir-axis-c.md` exists, names its configurations, reports nDCG@10 and Recall@100 per
  collection with a paired bootstrap interval, and states the FiQA control result.
- The existing cache files are accounted for rather than silently discarded. They were produced by
  configurations that all indexed title and text, so they are renamed to the name that field set now
  produces, and the renaming is recorded here with the moment it was done.
- `docs/plans/retrieval-quality.md` carries the result of phase 5.

Met 2026-08-18 12:15:26 +0200. The rename happened at 2026-08-18 10:35 +0200: five files named
`vectors-Xenova-all-MiniLM-L6-v2.bin`, under `scifact`, `nfcorpus`, `fiqa`, `local-news` and
`local-posts`, became `vectors-Xenova-all-MiniLM-L6-v2-title-text.bin`. They were produced by
configurations that all carried `fields: ['title', 'text']`, and the rename is checked rather than
asserted: `parallel-weighted` re-run against the renamed cache returned 0.7229 on SciFact and 0.3388
on NFCorpus, the same figures `docs/adr/020-reranking-runs-locally-and-stays-off-by-default.md`
section 4 recorded before this work.

`eval/beir/` is in `.gitignore`, so no cache file is committed and the rename is a local action. On a
machine that has none, the harness embeds and writes the correctly named file on first use, which is
the behaviour the cache always had.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The renamed cache turns out to hold something other than title and text vectors | Delete the cache files and re-embed. The numbers change only if the rename was wrong, which is exactly what the FiQA control would show | 1 hour of compute |
| The new configurations disagree with the published BM25 control | `bm25-beir-baseline` is untouched by this work and still reproduces the published figure, so a disagreement points at this change and it is reverted | 10 minutes |
| Text only wins and the product already does that | Nothing ships. The finding is that the bench was measuring a system better than the product, and the correction belongs to the bench | not applicable |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the product prepends the title to every chunk | This measurement returns a gain on the collections that have titles |
| Whether generated document context is worth one model call per document here | The title option is measured, and a key exists to run the generation |
| Whether a title helps or hurts once the 256 token window is full, since the title spends part of the same budget | Axis F changes the window |
