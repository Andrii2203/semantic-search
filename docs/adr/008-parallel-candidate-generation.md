# ADR-008: Candidate generation runs in parallel, not sequentially

Status: accepted
Owner: repository owner
Last change: 2026-08-14 19:52:18 +0200
Supersedes: docs/adr/001-hybrid-search.md, the sequential default only

## 1. Problem

ADR-001 chose sequential candidate generation: BM25 filters first, cosine similarity scores only what
BM25 returned. Its stated reason was that this is much faster than a parallel scan of all vectors, and
its stated trade-off was "Sequential mode економить CPU".

The consequence was never measured against an alternative. A document that contains no query keyword
cannot be returned at all, whatever its meaning, because the branch that could find it only ever sees
the list the other branch produced.

That claim was made in words on both sides. It is now a number on both sides, taken on public
collections with human relevance judgments, and recorded in `docs/eval/beir-axes-a-b.md`.

## 2. Alternatives

- Keep sequential. Rejected by the measurement below.
- Dense retrieval alone. Rejected: it scores about the same as BM25 on nDCG@10 on both collections,
  0.6539 against 0.6645 on SciFact and 0.3114 against 0.3071 on NFCorpus, so replacing one branch with
  the other buys nothing. It retrieves a different set, which is the argument for running both.
- Parallel generation, fused by rank. Measured.
- Parallel generation, fused by weighted score. Measured, and the choice between the two fusion
  methods is undecided, see section 5.

## 3. Decision

Both branches generate candidates independently over the whole corpus, and their results are fused.
The sequential mode stays in the code as a named configuration, because it is the baseline every
future measurement is compared against, and it stops being the default.

The fusion method is not decided by this ADR. Either fusion beats sequential by more than the bench
can resolve, and the two cannot be separated from each other.

## 4. The measurement that superseded ADR-001

From `docs/eval/beir-axes-a-b.md`, run 2026-08-14, paired bootstrap over queries, 95 percent
intervals:

| Comparison | Dataset | Metric | Difference | Interval |
|---|---|---|---|---|
| parallel over sequential | SciFact | nDCG@10 | +0.0397 | [0.0199, 0.0597] |
| parallel over sequential | SciFact | Recall@100 | +0.0791 | [0.0490, 0.1112] |
| parallel over sequential | NFCorpus | nDCG@10 | +0.0190 | [0.0086, 0.0294] |
| parallel over sequential | NFCorpus | Recall@100 | +0.0875 | [0.0705, 0.1066] |

No interval contains zero. Every difference clears the resolution of its collection, measured
separately in `docs/eval/beir-bm25-control.md` section 6.1.

The number that settles it needs no statistics. Sequential rescoring and BM25 alone produce identical
Recall@100 on both collections, 0.8792 on SciFact and 0.2346 on NFCorpus, to four decimals, because
rescoring a lexical candidate list cannot retrieve what that list omitted. On NFCorpus the parallel
shape retrieves 0.0875 more, which is 37 percent above what the product finds today.

## 5. Trade-offs

What ADR-001 bought, measured on the same runs: sequential completes a full collection pass in 12 to
13 seconds against 13 to 15 for parallel, once the corpus vectors exist. The vectors are computed
once and cached, at 388.6 seconds for 5183 documents and 301.2 for 3633, roughly 13 documents per
second on one container.

So the saving is under three seconds per pass, and the cost is a third of recall. At this corpus size
the trade ADR-001 made is not worth making. ADR-001's own revisit condition, a corpus above 100
thousand documents, is a condition for revisiting the index, not for keeping a branch that cannot
retrieve.

What this ADR does not claim: that the ordering holds on this product's own content. The collections
are scientific claims and medical abstracts, both English, both with real document bodies. The
product ingests short news items in two languages. That check is named as an open question below and
is the reason this ADR changes a default rather than closing the plan.

## 6. When to revisit

- The same five configurations run on the local news bench and disagree with this ordering.
- Corpus growth makes a full vector scan per query too slow to serve, which is the trigger already
  recorded for an approximate nearest neighbour index in `docs/plans/retrieval-quality.md` section 3.
- A reranker lands, axis E, and changes what candidate generation needs to deliver.

## 7. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Which fusion method, and at what weights | Neither is separable from the other on two collections. See `docs/eval/beir-axes-a-b.md` section 7.2 |
| Partly answered 2026-08-14 20:10:41 +0200 in `docs/eval/local-news-axis-a.md`. On the product's own news content parallel retrieves 0.3059 more of the relevant set than sequential, an interval excluding zero and a 45 percent increase. Ranking quality on news stays unanswered, because the bench has eight usable topics | open, on nDCG only |
| When the code changes its default, and under which plan | This ADR records the decision. The change itself belongs to phase 4 of `docs/plans/retrieval-quality.md` and has not been made |
