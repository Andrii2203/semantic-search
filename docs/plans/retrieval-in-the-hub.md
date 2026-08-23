# Retrieval in the Hub

Status: active
Owner: repository owner
Last change: 2026-08-23 20:27:55 +0200
Supersedes: none

## 1. Problem

Phase 3 of `docs/plans/finance-vertical.md` asks for chunks and vectors in Postgres, and for hybrid
search to replace the substring match and the entity overlap. Two of those three are still true of
the running Hub, measured 2026-08-23 20:05 to 20:20 +0200.

The Hub cannot find anything it was not asked for literally.
`backend/src/articles/articles.service.ts:97` filters the article list with `contains` over the
title and the summary. A search for `interest rate decision` returns nothing about a rate cut unless
those three words appear in the text.

The Hub holds no vector. `grep -rln "embedding" backend/src` returns nothing and no migration
mentions a vector column, so nothing in the product can compare two pieces of text by meaning.

The entity overlap that answers "similar articles" was made fast on 2026-08-23 by
`docs/plans/article-similarity.md`, and it is still an overlap of extracted names. Two articles about
the same event that name different people are unrelated to it.

Meanwhile the engine that measures its own retrieval on three public collections has no data at all:
the corpus of the three retired sources was deleted 2026-08-20 19:15:47 +0200.

## 2. Decision

The Hub stores a chunk per piece of an article and a vector per chunk, produced by the retrieval core
of the search repository copied in as JavaScript. One search endpoint answers a query by running a
lexical branch and a dense branch over the account's chunks and fusing them by reciprocal rank. The
article page gets neighbours by cosine beside the entity overlap it already has.

Proof of need: `docs/adr/022-the-retrieval-core-moves-into-the-hub-as-javascript.md`.

## 3. Scope

In scope:
- The six copied core files, unedited, with a checksum test.
- A `chunks` table with the text, the vector, the model and the account.
- Chunking and embedding at the end of article processing, and a backfill for what is already stored.
- `GET /api/search`, a hybrid search over one account's chunks.
- Neighbours by cosine on the article page.

Out of scope, each with its reason:
- pgvector and any approximate index, per ADR-022 section 5, because no latency measurement asks for
  it and the corpus was 20 articles on 2026-08-22.
- Reranking, because `docs/adr/020-reranking-runs-locally-and-stays-off-by-default.md` decided it is
  off by default, and switching it on here would ship a stage no measurement of this corpus supports.
- The similar count on the article list, which stays on the entity overlap shipped by
  `docs/plans/article-similarity.md`. The count asks a question per row and the vector answer needs a
  scan per row, which is the defect that document removed.
- The graph screen's substring filter, because nothing has measured what it costs there.
- Any claim that Hub retrieval is better than what it replaces. There is no answer key for this
  corpus, per ADR-022 section 6.
- The hierarchical chunker, because it calls a language model, per ADR-022 section 4.

## 3.1 What was copied, and its checksum

Copied 2026-08-23 20:26 +0200 from `semantic-search/src/`, unedited, into
`backend/src/retrieval/core/`. Behaviour 13 checks these values.

| File | Lines | sha256 |
|---|---|---|
| `core/search-constants.js` | 82 | `afee5652ac615df8c91a4c1a6d9fded3ac0ce0ecb980ddd373d2ac23e0ac65b0` |
| `core/models.js` | 55 | `b55a3e786aec1d4d8c427f3a2ba2e9abb8d28ef4bb70eb5e7d67aab567784c46` |
| `core/search-engine.js` | 275 | `2526c2ee5e4ca6f01f2e7603184aa23432aadda32007bbc510e221cb5755b834` |
| `core/chunker/utils.js` | 94 | `29d5d17834af21016abd7e8b559c642dd4cbb1cc7eba6936e065803f999b3c2a` |
| `core/chunker/semantic.js` | 58 | `eb08f90467da8a5cc9ebe41cb14c1c167dc96d942882b001e4d930b765bb2e78` |
| `core/chunker/fixed.js` | 37 | `617958a0452a8433233f9e998cc5bd9cc73770e3fea215c382a178e739d7eb04` |

The configuration those files carry, and which every behaviour below runs under:
`onnx-community/embeddinggemma-300m-ONNX`, stored at 384 of its 768 values and renormalised, chunks
of 200 words with 50 of overlap, reciprocal rank fusion at k 60, weights 0.4 lexical and 0.6 dense.

## 4. Behaviours

1. An article that finishes processing stores at least one chunk for the account that owns it.
2. A chunk carries the model that produced its vector and the number of values that vector holds.
3. A text shorter than the chunking threshold is stored as exactly one chunk.
4. Deleting the processing row deletes its chunks.
5. Embedding an article that already has chunks of the same model leaves one set of chunks, not two.
6. The document side and the query side are embedded with their own instruction prefix.
7. A vector reads back from the database as the values that were written, to seven decimal places.
8. Search ranks an article by its best matching chunk.
9. Search returns no article belonging to another account.
10. Search returns an article that shares no word with the query when its meaning matches.
11. Search returns an article that only one of the two branches found.
12. Search over an account whose chunks carry no vector answers from the lexical branch alone.
13. The copied core files hash to the values in section 3.1.
14. The article page lists neighbours by cosine, ordered by their score.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 2 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 3 | L1 | `backend/src/retrieval/chunking.spec.ts` |
| 4 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 5 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 6 | L1 | `backend/src/retrieval/embedding.service.spec.ts` |
| 7 | L1 | `backend/src/retrieval/embedding.service.spec.ts` |
| 8 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 9 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 10 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 11 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 12 | L2 | `backend/tests/retrieval.integration.spec.ts` |
| 13 | L1 | `backend/src/retrieval/core-checksums.spec.ts` |
| 14 | L2 | `backend/tests/retrieval.integration.spec.ts` |

No test loads the model. The encoder is an injected function, per
`docs/standards/TESTING_STANDARD.md` section 3, which keeps the network out of the suite. That the
real model runs at all is the live check in section 6, not a test.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run lint` and `npm test` are green in `backend`, and the integration specs pass against the
  running Postgres.
- One live check: real articles embedded by the real model against the running Postgres, and one
  search that returns them, with the two log lines of ADR-022 question 5 pasted into section 9. It
  ran on the host rather than in the worker container, and section 9 says what that leaves untested.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The model cannot load in the container | The vector column is nullable and behaviour 12 keeps search answering from the lexical branch | minutes |
| Embedding slows ingest | The chunk and embed step is one call at the end of article processing. Remove the call, keep the table and the backfill script | minutes |
| The cosine scan becomes the cost of a search | ADR-022 section 5 names the trigger and the move to pgvector | one day |
| The copied core drifts | Behaviour 13 fails in the suite before anything reaches the product | minutes |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the article list search switches from `contains` to this endpoint | The endpoint answers a real account and the owner compares the two on the same query |
| Whether the similar count on the list moves to vectors as well | A corpus where the entity overlap and the cosine disagree on an article the owner cares about |
| Whether the Hub gets an answer key of its own, so any of this can be called better | Phase 5 of `docs/plans/finance-vertical.md`, which needs to rank explanations rather than list them |
| Where the model cache lives in production | The first deployment to a host that is not this machine |

## 9. The live check

Run 2026-08-23 between 20:51:10 and 20:52:56 +0200 against the stack that has been up since the
audit, on a new account with one Ars Technica feed pulled through the API. Twenty articles stored,
sixteen of them at status `error` because the language model key is still a placeholder, which is
the same state `docs/plans/hub-audit.md` section 4 recorded and which the chunker does not depend on.

Embedding, by the real model, through the backfill command:

    {"chunks":1,"message":"chunks embedded","model":"onnx-community/embeddinggemma-300m-ONNX","ms":5766, ...}
    {"chunks":1,"message":"chunks embedded","model":"onnx-community/embeddinggemma-300m-ONNX","ms":266, ...}
    20 articles embedded for retrieval-live@local

The first article pays 5766 milliseconds because the model loads on it. Every article after it costs
about 300, and two articles produced two chunks rather than one.

Search, same account, query `electric car recall ordered by the authorities`:

    {"dense":22,"documents":20,"lexical":2,"message":"search served","ms":41, ...}
    0.0328  bm25 1     dense 1  Chinese regulators tell Tesla to fix nearly 3 million cars
    0.0318  bm25 2     dense 4  Genesis joins the giant electric SUV club with new GV90
    0.0161  bm25 null  dense 2  Lawsuit demands Logitech hand tariff refunds over to customers
    0.0154  bm25 null  dense 5  Waymo doubles spending on lobbying in robotaxi battle with Uber

41 milliseconds warm, over 22 chunks, and 2039 on the first query of a process because the model
loads there too. Three of the five results reached the list through the dense branch alone, which is
the thing the substring match could not do at all. Nothing here says the ranking is good, per ADR-022
section 6.

The account these numbers came from was deleted at 21:05 +0200 by the integration suite, which ran
`prisma.user.deleteMany()` with no filter against the product database.
`docs/plans/hub-test-database.md` fixes that. The account was rebuilt at 21:28 +0200 by the same
three commands, and the product database now holds 22 chunks, every one of them carrying a 1536 byte
vector.

What the live check did not exercise, written down rather than implied. It ran on the host, not in
the worker container, so the container has never loaded the model and the image carries no model
cache volume. The trigger is the next deployment, and the open question in section 8 about where the
cache lives is the same one.
