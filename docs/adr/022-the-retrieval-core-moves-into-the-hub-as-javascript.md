# ADR-022: The retrieval core moves into the Hub as JavaScript, and its vectors live in Postgres as bytes

Status: accepted
Owner: repository owner
Last change: 2026-08-23 20:24:16 +0200
Supersedes: none

## 1. Problem

`docs/plans/finance-vertical.md` phase 3 puts the retrieval core inside the Hub, with vectors in
Postgres. It does not say in what form the core arrives, in what form a vector is stored, or what
answers a query today.

Three facts were read from the code rather than recalled, on 2026-08-23 between 20:05 and 20:20
+0200.

The Hub has no vector of any kind. `grep -rn "pgvector|vector(" backend/prisma/schema.prisma
backend/prisma/migrations/*/migration.sql` returns nothing, and `grep -rln "embedding" backend/src`
returns nothing.

The Hub's search is a substring match. `backend/src/articles/articles.service.ts:97` filters with
`contains` over the article title and the stored summary, and `backend/src/graph/graph.service.ts:61`
does the same over two labels.

The engine that would replace it is CommonJS JavaScript with one runtime dependency.
`semantic-search/src/search-engine.js` imports `@huggingface/transformers` dynamically and nothing
else; `models.js`, `search-constants.js` and three of the four chunker files require only each other.

## 2. Decision

The retrieval core is copied into the Hub as JavaScript, unedited, and called from TypeScript. A
chunk vector is stored in Postgres as a `bytea` of a `Float32Array`, 384 values wide, with the model
that produced it written in the same row. Similarity is an exact cosine over the chunks of one
account. There is no pgvector and no approximate index.

Proof of need: section 3.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | Two events that already happened. The corpus of the three retired sources was deleted on 2026-08-20 19:15:47 +0200, so the measured engine has no product and no data. And the Hub review named entity overlap and the substring match as its main weakness, confirmed in the code at `articles.service.ts:97` and recorded in `docs/plans/hub-audit.md` section 4.1 |
| 2 | Cost of not doing it | The Hub can only find an article that literally contains the typed characters, and can only relate two articles that share an extracted entity. Phase 5 of `docs/plans/finance-vertical.md`, stance and novelty and the explanation of a move, is not reachable from either |
| 3 | Cheapest alternative | Postgres full text search alone, no vectors. Rejected on a measurement this project already owns: `docs/eval/beir-axes-a-b.md` section 6 measured a dense branch beside the lexical one at +0.0397 nDCG@10 and +0.0875 Recall@100 over the lexical first arrangement, on three collections. Full text search is still built, as the lexical half of the pair, so the alternative is kept rather than discarded |
| 4 | Kill criterion | A search over the Hub's own corpus that spends more time on the exact cosine than on everything else, or an embed job that falls behind ingest. Both are decided by the log line of question 5, not by opinion |
| 5 | Signal | Two log lines. `chunks embedded` with the count, the model and the milliseconds, per article. `search served` with the size of each branch and the milliseconds, per query |

## 4. Why the core is copied rather than rewritten or imported

Three routes were possible and the cheapest one was not obvious.

| Route | Cost | Verdict |
|---|---|---|
| Rewrite in TypeScript | Every constant, prefix and truncation rule is re-entered by hand, and `docs/plans/finance-vertical.md` section 3 already put this out of scope | No |
| Depend on the search repository over git | `semantic-search/package.json` carries `express`, `better-sqlite3` and the whole server. Installing it in the Hub image drags a native SQLite build into a Postgres product | No |
| Copy the pure modules, unedited | Six files, 297 lines of chunker and 270 of engine, no import outside themselves except the model runtime | Yes |

What is copied: `search-constants.js`, `models.js`, `search-engine.js`, and the chunker's
`utils.js`, `semantic.js` and `fixed.js`.

What is not copied, and why: `chunker/hierarchical.js` calls a language model through
`groq-client.js`, and `docs/plans/retrieval-quality.md` section 12 still holds open whether the
language model paths survive at all. `chunker/index.js` is not copied either, because it registers
the hierarchical strategy and would drag it in.

The cost of copying is drift, and it is paid rather than denied. Two copies of a constant can
disagree, and nothing in either repository would notice. The guard is a checksum test in the Hub:
the copied files hash to the values recorded in `docs/plans/retrieval-in-the-hub.md`, so an
accidental local edit fails the suite. It does not catch a change made in the search repository, and
that limit is written down instead of being papered over.

## 5. Why the vector is bytes and not pgvector

pgvector buys two things: an operator that computes the distance in the database, and an approximate
index over it. The second is what makes it worth an extension, and this product has no measurement
that asks for it.

`docs/plans/retrieval-quality.md` section 3 already keeps approximate nearest neighbour indexing out
of scope for the same reason, that no latency measurement shows a problem at this corpus size, and
`docs/standards/DECISION_PROTOCOL.md` question 1 requires a trigger that already happened. The Hub's
corpus on 2026-08-22 19:29:35 +0200 was 20 articles.

The serialisation is the one the search repository already uses, `serializeVector` and
`deserializeVector` in `search-engine.js`, so a vector written by either system is readable by the
other. 384 values at four bytes is 1536 bytes per chunk.

The trigger that reopens this: a search whose cosine stage exceeds 200 milliseconds on a real
account, read from the `search served` log line. At that point the extension is added, the column
becomes `vector(384)`, and the stored bytes are converted once.

## 6. What this decision does not settle

It does not claim the Hub's retrieval is good. No answer key exists for the Hub's corpus, so every
number in `docs/eval/` still describes the bench of the search repository and nothing here. The
quality question is answered when the Hub has a judged set of its own, and until then this decision
buys a capability, not a measured improvement.

It does not settle whether the two retrieval implementations become one, which is the first open
question of `docs/reference/system-anatomy.md` section 14. It adds a third caller of the same pure
functions, and that is honestly a step away from the answer rather than towards it.

## 7. Behaviours

Not applicable. This ADR records a decision. The behaviours belong to
`docs/plans/retrieval-in-the-hub.md`.

## 8. Definition of done

- The plan document exists and names the six copied files with their checksums.
- Every claim of section 1 was produced by running something, and says when.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| The model cannot run in the worker container | The chunk rows stay, the vector column is nullable, and search falls back to the lexical branch alone | minutes |
| The copied core drifts from the search repository | The checksums say which file moved. Copy again, rerun the suite | minutes |
| The exact cosine becomes the cost of a search | Section 5 names the trigger and the migration to pgvector | one day |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the Hub embeds the article body, the summary, or both | The first search over a real account where the two disagree |
| Whether the copied core is ever replaced by one shared package | A third consumer appears, or the search repository stops being maintained |
| Which repository owns the retrieval documents once the Hub is the trunk | Unchanged from `docs/plans/finance-vertical.md` section 10, and this document is the first that had to choose. It stays here, because the standards and every measurement that justifies it are here |
