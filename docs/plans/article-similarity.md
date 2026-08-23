# Article similarity off the request path

Status: active
Owner: repository owner
Last change: 2026-08-23 14:43:36 +0200
Supersedes: none

## 1. Problem

Recommendation 1 of the Hub review, recorded in `docs/plans/hub-audit.md` section 4.1 and measured
there rather than taken on trust.

Every request for the article list loads the whole corpus of one user into memory.
`backend/src/articles/articles.service.ts:118` calls `similarIndex`, which reads every
`articleProcessing` row of that user together with all of its entities, builds a `Set` of entity ids
per row, and returns the lot. The list then calls `countSimilar` once per article shown, and each of
those walks the entire index intersecting sets.

For a page of twenty articles over a corpus of n, that is twenty passes over n, each pass doing a set
intersection. Opening one article costs the same again through `findOne`, which builds the index a
second time to find neighbours.

Nothing about it is cached, so the cost is paid on every list, every filter change and every card.
The corpus only grows, and the review named this as the main weakness of the product.

## 2. Decision

Both call sites ask the database the question instead of loading the corpus and answering it in
JavaScript. Two queries: one that returns a count of similar articles for a given set of processing
ids, one that returns the neighbours of a single article with the number of entities they share.

An index on `processing_entities(entityId)` exists to serve the join, because the table today is
indexed only by `(processingId, entityId)`.

Proof of need: `docs/plans/hub-audit.md` section 4.1, recommendation 1, which is a defect observed in
the code of a running system.

## 2.1 Where this departs from the review, and why

The reviewer wrote: compute the intersections incrementally when the article is processed, or at
least cache the result. This document does neither, and the reasons are worth recording because a
departure from a review that produced a correct diagnosis needs one.

The document frequency cap makes a stored count stale across the whole corpus. An entity present in
more than `SIMILAR_DF_MAX_SHARE` of a user's articles is ignored, so adding one article can change
which entities are eligible and therefore change the count of articles that were never touched. An
incremental writer would have to find and correct them, which is the same corpus scan this document
is removing, moved to the write path and made harder to see.

The count is not what the article page needs. `findOne` needs the neighbours themselves and their
shared totals, which a stored count cannot answer. Storing the neighbour lists instead multiplies the
staleness problem by the size of each list.

Phase 3 of `docs/plans/finance-vertical.md` replaces entity overlap with embeddings. A query is
deleted in one commit. A write path with a backfill and an invalidation rule is not.

If the query proves too slow on a real corpus, caching it is still available and is then a decision
with a measurement behind it. That is the rollback in section 7.

## 3. Scope

In scope:
- `similarIndex`, `countSimilar` and `sharedCount` in the articles service, and the two call sites.
- One migration adding the index that serves the join.

Out of scope:
- Recommendation 2, semantic similarity on embeddings. That is phase 3 and it replaces what this
  document makes fast, rather than competing with it.
- The graph service, which has a similarity notion of its own and was not named by the review.
- Any change to what the endpoints return. The numbers must not move, which is behaviour 5.

## 4. Behaviours

1. The article list reports the same similar count for an article as the set intersection it
   replaces.
2. The article page reports the same neighbours, in the same order, as the set intersection it
   replaces.
3. An entity present in more than the configured share of a user's articles counts towards no
   similarity.
4. An article shares no similarity with articles of another account.
5. Listing a page of articles issues a number of database queries that does not grow with the number
   of articles in the corpus.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L2 | `backend/tests/similarity.integration.spec.ts` |
| 2 | L2 | `backend/tests/similarity.integration.spec.ts` |
| 3 | L2 | `backend/tests/similarity.integration.spec.ts` |
| 4 | L2 | `backend/tests/similarity.integration.spec.ts` |
| 5 | L2 | `backend/tests/similarity.integration.spec.ts` |

The tests are integration rather than unit because the behaviour under test is a query. Faking the
database here would test the fake, per `docs/standards/TESTING_STANDARD.md` section 3.

Behaviour 1 and 2 are written against the old implementation kept in the test as the expected answer,
so that the replacement is measured against what it replaces rather than against a hand written
expectation.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run lint` and `npm test` are green in `backend`.
- The live cycle of `docs/plans/hub-audit.md` section 4 runs again and the list still answers.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The query is slower than the loop on a real corpus | Both call sites take the same shape. Put the old index back behind the same method, then measure before choosing again | one hour |
| The query answers differently from the loop | Behaviours 1 and 2 compare them directly, so this fails in the suite rather than in the product | not applicable |
| The new index costs more on write than it saves on read | Drop the index. The query still works, more slowly | minutes |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the query needs caching after all | A corpus large enough to measure it, which this product does not have yet |
| Whether the graph service shares this defect | Somebody reads it with this question in mind |
