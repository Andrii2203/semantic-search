# The embedding model in the product

Status: active, closed 2026-08-20 19:15:47 +0200, see section 6
Owner: repository owner
Last change: 2026-08-20 19:15:47 +0200
Supersedes: none

## 1. Problem

The product runs the model this project has already decided to replace, and it cannot replace it
without silently breaking three things that no test and no log would report.

`docs/adr/021-embeddinggemma-truncated-to-384.md` chose `onnx-community/embeddinggemma-300m-ONNX`
truncated to 384 on 2026-08-20 08:48:11 +0200, on three collections, each gain above that
collection's own resolution. The product embeds with `Xenova/all-MiniLM-L6-v2`, written as a literal
in `src/search-engine.js` line 16. So the last axis this project measured describes a system that
does not ship, which is the same gap `docs/eval/beir-axis-c.md` section 8 found for the indexed
text.

The model name has two origins, which phase 2 exists to prevent. It is a literal in
`src/search-engine.js` line 16 and it is `embeddingModel` in `src/search-constants.js` line 70,
where it sits in the evaluation group whose opening sentence in `docs/reference/search-constants.md`
section 5.1 says an evaluation constant does not change what search returns. That sentence is false
of this one. The width has the same shape of defect: `src/startup.js` line 21 compares the vector
length against a literal 384.

No stored vector says what produced it. `chunks.vector` and `profiles.vector` are BLOBs, added by
migrations 003 and 005, and neither table carries a model or a width. Three consequences follow the
moment two generations of vectors exist in one database, and all three are silent.

| Where | What happens | Why nothing reports it |
|---|---|---|
| `src/search-engine.js` line 29 | `cosineSimilarity` returns 0 when the two vectors differ in length, so every chunk from the previous model scores 0 and disappears from the dense branch | The result is a valid number. The lexical branch still returns those chunks, so search looks like it works and is running on one branch |
| `src/feedback.js` line 53 | `applyFeedback` returns false when the item vector and the profile vector differ in length, so a star, an approve and a skip stop moving the profile | The route treats false as a no operation |
| `src/db.js` line 1030, through `src/scheduler.js` | Near duplicate detection compares a new vector against the 200 most recent ones, and a cross generation comparison scores 0, so nothing is ever a duplicate | The count of skipped duplicates simply goes to zero, which reads as a clean feed |

The width check hides the worse case rather than catching it. EmbeddingGemma truncated to 384
produces vectors of the same width as the current model and of a different space entirely, so every
guard above passes and every score is meaningless. That is why the model belongs on the row rather
than being inferred from the length.

The product also embeds without the instruction prefixes the winner requires. `src/eval/models.js`
line 13 records that this model takes one prefix on a document and a different one on a query, every
number in `docs/eval/beir-axis-f.md` was taken with both applied, and
`docs/adr/021-embeddinggemma-truncated-to-384.md` section 6 names applying one side only as a silent
quality defect. `generateEmbedding` in `src/search-engine.js` line 22 takes a text and nothing else,
so the product path has no way to say which side it is embedding.

One more thing is not indexed, and it shares the reindex with everything above. `src/scheduler.js`
line 109 chunks `item.content` while the title sits in `item.metadata.title`, so no chunk has ever
contained a title. `docs/eval/beir-axis-c.md` measured the title in the indexed unit at 0.0154
nDCG@10 on SciFact and 0.0056 on NFCorpus, both intervals excluding zero, and 0.0000 on FiQA, which
carries no titles and was the control. That is open question 1 of
`docs/plans/axis-c-indexed-text.md` and its trigger fired on 2026-08-18.

What this costs is measured rather than estimated. `docs/eval/beir-axis-f.md` section 9 records
EmbeddingGemma at 20 hours 33 minutes of wall clock and about 70 processor hours for FiQA's 57638
documents at batch 16, holding 5 gigabytes of resident memory. The product's ingest cycle handles
tens of items and is not the problem. The first reindex, which touches every chunk already stored,
is.

## 2. Decision

The embedding model becomes one name in the retrieval half of `src/search-constants.js`, read by the
product's embedding path together with the model's own facts: its prefixes, its batch and the width
the product stores. Every chunk row and every profile row carries the model and the width that
produced it, every vector comparison is restricted to one model, and `scripts/reindex-embeddings.js`
rebuilds the stored vectors under the active model. In the same reindex, a chunk is built from the
item's title and its text rather than from the text alone.

Two axes ship in one document because they share one reindex. Axis F changes what embeds every chunk
and axis C changes what text every chunk holds, and each one on its own requires re-embedding the
whole corpus. Shipping them apart means running the 20 hour operation twice for a result no
measurement distinguishes. The alternative is recorded rather than hidden: one document per axis,
and the price is the second run. The risk it creates is also recorded, in the rollback table,
because a reindex that changes two things cannot be bisected afterwards.

Proof of need: `docs/adr/021-embeddinggemma-truncated-to-384.md` section 3 states that the
migration, the model column and the reindex belong to the document that ships them, and this is that
document. The title half is authorised by open question 1 of `docs/plans/axis-c-indexed-text.md`,
whose trigger fired. The second origin of the model name and the three silent failures in section 1
are defects, which `docs/standards/DECISION_PROTOCOL.md` section 2 exempts from the proof of need.

## 3. Scope

In scope:
- `src/eval/models.js` moves to `src/models.js`, so the product and the harness read one facts
  table. This is the move `docs/plans/local-reranker.md` made for `src/cross-encoder.js`, for the
  same reason.
- `src/search-engine.js` reading the model, the prefixes and the stored width by name, and
  `generateEmbedding` taking the side it is embedding.
- `embeddingModel`, `embeddingBatchSize` and a new `embeddingDimensions` crossing from the
  evaluation group of `src/search-constants.js` into the retrieval group, with their rows crossing
  from section 5.1 of `docs/reference/search-constants.md` into section 5.
- Section 4 of `docs/reference/search-constants.md`, the model facts, rewritten for the new model.
  That section already declares itself void when axis F picks a winner.
- Migration 016, adding `model` and `dimensions` to `chunks` and to `profiles`, backfilled with the
  model every existing vector was produced by.
- The model filter on the two readers that feed a cosine comparison, `getAllChunksWithVectors` and
  `getRecentInternetChunkVectors`, the count of chunks held under another model that the search stats
  report, and the model check in `src/feedback.js`.
- Behaviour 8 of `docs/reference/search-constants.md`, which currently allows `src/search-engine.js`
  to import `src/search-constants.js` and nothing else, widened by one module. What that behaviour
  protects is that the ranking functions reach no database, no configuration and no logger, and
  `src/models.js` is a frozen table of facts and pure functions over vectors, so it reaches none of
  the three. The alternative, a separate `src/embedder.js` so the isolation line does not move,
  changes eleven call sites for a property no test measures.
- The title at the head of every chunk of an item that has one.
- `scripts/reindex-embeddings.js`, resumable, reporting progress, writing each batch before starting
  the next.
- The reindex run itself, recorded with its wall clock and its peak memory.
- The model pinned on the evaluation configurations that were measured before this change, so that a
  published configuration name keeps meaning what it meant when its number was published.

Out of scope, each with its reason:
- Raising `chunkMaxWords` now that the window is 2048 rather than 256. It is open question 2 of
  ADR-021, it changes chunk construction, which axis C owns, and doing it inside this reindex would
  make the reindexed corpus incomparable to everything measured on the old chunking.
- Replacing `tokensPerWord` with the model's own tokeniser, for the same reason and with the same
  ownership, although its trigger has fired. See section 8.
- Storing 768 wide vectors. ADR-021 section 4 measured the loss at 384 and named the trigger that
  reopens it, which is reranking on by default.
- Turning reranking on by default, which ADR-020 declined to do on a measurement that helps two
  collections and harms a third.
- Progress reporting and incremental writes in `scripts/compare-beir.js`. That is the first open
  question of `docs/eval/beir-axis-f.md` and it belongs to the bench. The reindex script here
  carries both properties as behaviour 12, so the lesson lands where the next long run actually
  happens.
- Any change to the numbers in `docs/eval/beir-axis-f.md` or `docs/eval/beir-axis-c.md`. This
  document ships two measured configurations, it measures nothing new.
- The Ukrainian holdout, which `docs/plans/retrieval-quality.md` section 5 runs once against the
  winner in phase 8, not here.

## 4. Behaviours

One line per checkable statement, and one test per line, because
`docs/standards/TESTING_STANDARD.md` section 8 makes the test name the behaviour line and that check
only works when the two lists have the same shape.

1. `src/search-engine.js` embeds with the model named by `embeddingModel` and contains no model
   identifier of its own.
2. `generateEmbedding` sends a document under the active model's document prefix and a query under
   its query prefix, so one text never reaches the encoder as the same string on both sides.
3. `generateEmbedding` embeds as a query when the caller names no side.
4. `generateEmbedding` returns `embeddingDimensions` values, renormalised, when the model is wider
   than that.
5. `generateEmbedding` returns the width of the model when the model is no wider than
   `embeddingDimensions`.
6. Every chunk the ingest path writes carries the model that embedded it and the width of the vector
   it stored.
7. A chunk of an item that has a title begins with that title.
8. A chunk of an item that has no title is the text alone.
9. An item whose chunk repeats a stored chunk of another model is indexed rather than skipped as a
   near duplicate.
10. `getRecentInternetChunkVectors` returns the vectors of one named model only.
11. `getAllChunksWithVectors` returns the chunks of one named model only.
12. The `chunks` and the `profiles` table carry the model and the width of every vector they store.
13. The backfill of migration 016 gives every stored vector the model it was produced by.
14. The backfill claims no origin for a row that holds no vector.
15. `fromText` returns the model that embedded the profile and the width of its vector.
16. A profile is embedded as a query.
17. A profile whose embedding failed carries no vector, no model and no width.
18. The search route stores the model and the width with the profile it saves.
19. The dense branch scores only the chunks of the active model.
20. The search stats report how many chunks the corpus holds under another model.
21. `applyFeedback` leaves the profile unchanged when the item was embedded by another model.
22. `applyFeedback` names the model of the profile and the model of the item when it refuses.
23. The startup embedding check passes when the model returns `embeddingDimensions` values.
24. The startup embedding check names the width it got and the width it wanted when they differ.
25. `src/startup.js` reads the width it expects from `src/search-constants.js` rather than from a
    literal.
26. `scripts/reindex-embeddings.js` re-embeds every chunk whose stored model is not the active one.
27. It embeds a chunk as a document and a profile as a query.
28. It re-embeds a profile whose stored model is not the active one.
29. It leaves a profile that stored no text of its own untouched, and reports it.
30. It re-embeds nothing on a second run.
31. It keeps the batches it finished when a later batch fails.
32. It reports its progress as it goes, so a long run can be told from a stalled one.
33. `src/models.js` is the module `src/search-engine.js`, `src/eval/harness.js` and
    `src/eval/embedder.js` read model facts from.
34. `src/eval/models.js` no longer exists, so model facts have one origin.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/search-engine.test.js` |
| 2 | L2 | `__tests__/search-engine.test.js` |
| 3 | L2 | `__tests__/search-engine.test.js` |
| 4 | L2 | `__tests__/search-engine.test.js` |
| 5 | L2 | `__tests__/search-engine.test.js` |
| 6 | L2 | `__tests__/scheduler.test.js` |
| 7 | L2 | `__tests__/scheduler.test.js` |
| 8 | L2 | `__tests__/scheduler.test.js` |
| 9 | L2 | `__tests__/scheduler.test.js` |
| 10 | L2 | `__tests__/db.test.js` |
| 11 | L2 | `__tests__/db.test.js` |
| 12 | L2 | `__tests__/db.test.js` |
| 13 | L2 | `__tests__/db.test.js` |
| 14 | L2 | `__tests__/db.test.js` |
| 15 | L2 | `__tests__/profile-generator.test.js` |
| 16 | L2 | `__tests__/profile-generator.test.js` |
| 17 | L2 | `__tests__/profile-generator.test.js` |
| 18 | L3 | `__tests__/routes/search.test.js` |
| 19 | L3 | `__tests__/routes/search.test.js` |
| 20 | L3 | `__tests__/routes/search.test.js` |
| 21 | L2 | `__tests__/feedback.test.js` |
| 22 | L2 | `__tests__/feedback.test.js` |
| 23 | L2 | `__tests__/startup.test.js` |
| 24 | L2 | `__tests__/startup.test.js` |
| 25 | L1 | `__tests__/startup.test.js` |
| 26 | L2 | `__tests__/scripts/reindex-embeddings.test.js` |
| 27 | L2 | `__tests__/scripts/reindex-embeddings.test.js` |
| 28 | L2 | `__tests__/scripts/reindex-embeddings.test.js` |
| 29 | L2 | `__tests__/scripts/reindex-embeddings.test.js` |
| 30 | L2 | `__tests__/scripts/reindex-embeddings.test.js` |
| 31 | L2 | `__tests__/scripts/reindex-embeddings.test.js` |
| 32 | L2 | `__tests__/scripts/reindex-embeddings.test.js` |
| 33 | L1 | `__tests__/models.test.js` |
| 34 | L1 | `__tests__/models.test.js` |

No test loads a model. The encoder is a boundary under `docs/standards/TESTING_STANDARD.md` section
3, and it is reached through a dynamic import that no module registry can intercept, so it is
injected the way `src/reranker.js` injects its scorer: `generateEmbedding` and `reindex` take an
`encode` in their options and fall back to the loaded model when none is given. Behaviours 2 to 5,
and 26 to 32, pass a fake one and assert the string that reached it and the width that came back.
Behaviours 1, 25, 33 and 34 are read from the source files, the way
`__tests__/reachability.test.js` and `__tests__/search-constants.test.js` already check properties no
return value can show.

Behaviours 16 and 27 are about the side a text is embedded on, and neither is asserted by looking at
a call. Behaviour 16 reads the vector the profile stored, from a fake encoder that returns a
different vector per side, so the assertion is on state rather than on an invocation. Behaviour 27
does the same through the vectors the reindex wrote. Section 6 of the testing standard forbids
asserting that a function of ours was called, and the side is exactly the kind of thing that invites
it.

`__tests__/eval/models.test.js` moves to `__tests__/models.test.js` with the module it covers, and
its existing cases for `truncateVector`, `withPrefix`, `batchFor` and `factsFor` are not rewritten.
They are the tests behaviours 8 and 9 of `docs/plans/axis-f-embedding-model.md` already produced.

## 6. Definition of done

- Every behaviour in section 4 has a passing test, and every test in the files of section 5 maps to a
  behaviour. The two way check of `docs/standards/TESTING_STANDARD.md` section 8 is what makes that
  readable: the test name is the behaviour line.
- The break a line check of `docs/standards/TESTING_STANDARD.md` section 9 was run once per
  behaviour, and section 10 of this document records which line was broken and what the test said.
  A test that stayed green is deleted rather than fixed.
- `npm run verify` is green.
- Section 4 of `docs/reference/search-constants.md` describes the new model, and the three constants
  that crossed groups have rows in section 5 rather than in section 5.1. The name sets are compared
  in both directions by `__tests__/search-constants.test.js`, so a missed row fails the suite.
- The truncation measurement of 2026-08-13 is repeated on the product path with the new model, and
  recorded whatever it says. It read that a 520 word input embeds identically with and without an
  appended sentence. At 1.54 tokens per word that input is about 800 tokens against a 2048 token
  window, so the expected result is that it stops reproducing. An expectation is not a result, which
  is why this line exists.
- A live ingest cycle stores at least one chunk whose model column is the new model and whose text
  begins with the item's title, checked by hand, because no test can prove the network path end to
  end.
- The reindex is run on the development database and its wall clock, its peak resident memory and
  its chunk count are recorded in section 11 of this document, in the shape
  `docs/eval/beir-axis-f.md` section 9 uses.
- The two open lines of `docs/adr/021-embeddinggemma-truncated-to-384.md` section 8 are closed by
  the two lines above, and the ADR says so.
- Behaviour 8 of `docs/reference/search-constants.md` names `src/models.js` alongside
  `src/search-constants.js`, and its test in `__tests__/search-engine.test.js` allows that import and
  no other. The widening is written in the reference before the import exists, not after.
- `docs/plans/retrieval-quality.md` carries the result of phase 6 and of this shipping work. Done:
  section 6.8 records the axis F result, the phase table names ADR-021 on row 6 and this document
  on row 6.5, and the row of section 6.2 that described a candidate which did not win is corrected.

Closed 2026-08-20 19:15:47 +0200. `npm run verify` is green: lint with no errors, 687 tests passed
and 6 skipped on the server, 21 on the client, coverage 94.18 percent of statements against a
threshold of 80. The break a line check ran and is recorded in section 10.

The three lines that no code could close are closed by running the model rather than by reasoning
about it.

| Line | Result |
|---|---|
| The truncation measurement of 2026-08-13 repeated on the product path | It does not reproduce, which is the answer this line asked for. A 520 word input and the same input with a decisive sentence appended score cosine 0.827514 at 2026-08-20 19:14 +0200, against 1.000000 on the previous model. The tail is read now |
| A live cycle storing a chunk that carries the new model and begins with its title | 27 items fetched from the Guardian science feed, 26 chunked, every chunk carrying `onnx-community/embeddinggemma-300m-ONNX`, 384 dimensions and a 1536 byte vector, and three checked by hand as beginning with their title. Section 11 holds the numbers |
| The reindex run | Ran and moved nothing, for the reason in section 11: the corpus it would have re-embedded was deleted as the remains of three retired sources |

The model loaded from the cache left by the bench run of 2026-08-18, so nothing was downloaded and
the question of whether this host can hold it is answered for one process at batch 16: it can, and a
cycle of 27 items took 6.6 seconds including the load.

One decision was taken while making the suite green and it belongs here rather than in a commit
message. `src/eval/harness.js` now pins `Xenova/all-MiniLM-L6-v2` on the six configurations that
carry no model of their own, being `bm25-beir-baseline`, `bm25-repository-defaults`, `dense-only`,
`sequential-rescore`, `parallel-rrf` and `parallel-weighted`. Until now they inherited
`embeddingModel`, so moving the product's model would have silently redefined every configuration
name that `docs/eval/beir-axes-a-b.md`, `docs/eval/beir-axis-d.md` and `docs/eval/beir-axis-e.md`
report numbers under, and `parallel-weighted` would have quietly become `parallel-weighted-gemma`. A
published number has to stay reproducible by the name it was published under.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The winner cannot load on the host, for memory or for architecture | `embeddingModel` is one name. Point it back at `Xenova/all-MiniLM-L6-v2`, whose vectors are still in the database and still carry their model, so the filter of behaviour 7 makes them live again | 5 minutes |
| The reindex cannot finish | It is resumable by behaviour 12 and it writes per batch. Stop it, and the product keeps answering from the vectors of whichever model is still active. Both generations coexist by design | immediate |
| Retrieval in the product gets worse despite the bench | Switch the model name back and reindex back, or leave both generations and switch, because the model is a setting rather than a migration | 1 hour, plus the reindex |
| The title makes results worse | It is one join in `src/scheduler.js` and one reindex. The measurement that would settle it is the local bench, once its dev split grows past 8 answerable intents | 1 hour, plus the reindex |
| The reindex changed two things and the result is worse than either | The two cannot be separated after the fact. The separation available is the bench, where `parallel-weighted-gemma-384` and `parallel-weighted-text-only` are named configurations that already differ one at a time | not applicable |
| The prefixes are wrong or applied to the wrong side | Behaviour 2 pins the string that reaches the encoder, so this is a test failure rather than a quality mystery | 20 minutes |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the title belongs in the model's own title slot instead of being joined into the text. The document format is `title: {title \| "none"} \| text: {content}`, read from https://huggingface.co/google/embeddinggemma-300m and https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX in the minutes before the stamp in this file's header. Every number in `docs/eval/beir-axis-f.md` was taken with the slot holding `none` and the title joined into the text by `fields`, so filling the slot ships a configuration nobody measured, and this document ships what was measured | A bench run comparing the two document formats on SciFact and NFCorpus, which costs one re-embedding per format |
| Whether 384 is a width this model supports. Both cards above name 768, 512, 256 and 128 as the Matryoshka widths and do not name 384. ADR-021 section 4 measured 384 against 768 on three collections and found the ranking unmoved, so the width works here, but it is an interpolation rather than a documented option | A published statement that intermediate widths degrade, or a measurement at 512 that beats 384 by more than the stored layout is worth |
| Whether `chunkMaxWords` rises now that the window is 2048. ADR-021 open question 2 | The winner ships, which this document does, and axis C is re-run on it |
| Whether `tokensPerWord` is replaced by the tokeniser before the reindex. Its trigger fired when this reindex was planned, and it is deliberately not answered here, because a reindex that changes the model, the indexed text and the chunking decision at once cannot be read afterwards | The axis C re-run on the new model, which is the next thing that touches chunk construction |
| Which side HyDE is. `src/routes/search.js` line 84 embeds a generated hypothetical document and uses it as the query vector, so the two sides disagree about what it is | The first measurement of HyDE on a model that has per side prefixes |
| Whether the host a person deploys this on can hold 5 gigabytes while it reindexes | The first deployment that is not the development machine |
| Whether the local news bench agrees with the public collections about this winner. ADR-021 open question 4 | The bench's dev split grows past 8 answerable intents |

## 9. What each test protects

The acceptance question of `docs/standards/TESTING_STANDARD.md` section 2 is which single line of
production code can be broken so that this test goes red and nothing else catches it. It is answered
here, before the code exists, so that the answer cannot be written to fit whatever was built.

| Behaviours | The line that breaks them | What breaks in the product if nobody notices |
|---|---|---|
| 1, 33, 34 | The model name written as a literal in `src/search-engine.js` instead of read by name | The product and the bench drift apart again, which is the defect that started this document |
| 2 | Applying one prefix to both sides in the embedding path | Silent quality loss. ADR-021 section 6 names it, and no other test in the suite would see it |
| 3 | The default side changed to `document` | Every query is embedded as a document, which is the same defect pointing the other way |
| 4, 5 | The truncation dropped, or applied without renormalising | Vectors of the wrong width or the wrong length reach the database, and cosine comparisons quietly return numbers that mean nothing |
| 6, 15, 18 | The model and width left off the insert, or dropped by the route that saves the profile | The three silent failures of section 1 come back, and nothing in the suite would say so |
| 7, 8 | The title join removed from the chunk builder | The measured axis C gain is lost and the bench again describes a system the product does not run |
| 9, 10 | The model argument dropped from `getRecentInternetChunkVectors` | Deduplication compares across generations, and every new chunk looks unique |
| 11, 19 | The model clause dropped from `getAllChunksWithVectors` | The dense branch scores stale vectors, and search silently runs on one branch |
| 12, 13, 14 | The backfill made to stamp every row rather than the rows that hold a vector | A row claims an origin it does not have, which is worse than no column at all |
| 16, 27 | The side flipped where a profile or a chunk is embedded | Same silent quality loss as behaviour 2, in the two places the product actually embeds |
| 17 | The failure path made to return a model with a null vector | A profile claims an origin for a vector that does not exist |
| 20 | The stale count removed from the stats | The switch between generations becomes invisible again, which is what section 1 is about |
| 21, 22 | The model check removed from `applyFeedback` | A star silently stops moving the profile, and the interface still says it worked |
| 23, 24, 25 | The width literal put back in `src/startup.js` | The boot check passes on a model of the wrong width, and the first sign is bad results |
| 26, 28, 30 | The filter that selects rows of another model | The reindex either does nothing or does everything twice |
| 29 | The guard on a profile that stored no text | The reindex throws on a real database, halfway through |
| 31 | The write moved after the loop instead of inside it | A twenty hour run that crashes at hour nineteen leaves nothing, which is the defect `docs/eval/beir-axis-f.md` section 9 recorded on the bench |
| 32 | The progress callback dropped | The same run cannot be told from a stalled one |

## 10. The break a line check

Run 2026-08-20 18:14:51 +0200, once per behaviour, on the code that had just gone green. Each run
broke one line of the table in section 9, ran the test file that owns the behaviour, recorded which
test names went red, and restored the line. Thirty four mutations, and every behaviour has one that
reddens its own test.

Three mutations came back green on the first pass, which is the only reason this check is worth
running. Two were faults in the mutation rather than in the test. The default side was broken in
`generateEmbeddings` while behaviour 3 is about the default of `generateEmbedding`, and behaviour 34
cannot be broken by editing a line at all, because what it asserts is the absence of a file, so it
was checked by recreating `src/eval/models.js` and deleting it again.

The third was a real weakness and the test was rewritten rather than kept. Behaviour 10 asserted that
`getRecentInternetChunkVectors` returned one row for a corpus holding one chunk per model. Inverting
the filter from `model = ?` to `model IS NOT ?` returns the other row, and the count is still one, so
the test could not tell the two apart. It now stores a different vector under each model and asserts
which vector came back. The rewritten test goes red under the same mutation.

Behaviour 8 needed its own mutation for the same reason. Removing the title join reddens behaviour 7
and leaves behaviour 8 green, correctly, because an item without a title is unaffected. The mutation
that reddens it prepends a title where there is none.

Two mutations are worth naming for their blast radius rather than their result. Dropping the `model`
column from `profiles` in migration 016 reddens forty tests in `__tests__/db.test.js`, and removing
the model filter from the chunk query in the reindex script reddens seven in its own file. Both
include the behaviour they were aimed at, so they pass the check, but a failure that wide names the
migration rather than the behaviour, and that is recorded here rather than presented as precision.

## 11. The reindex run

Run 2026-08-20 19:15:47 +0200 and it moved nothing, which is the honest result rather than a
disappointing one: `chunks: 0, profiles: 0, profilesWithoutText: 0`, zero seconds.

The reason is a decision taken the same day and it belongs next to the number. The database held 520
items and 509 chunks from the three sources `docs/adr/010-sources-narrowed-to-user-feeds.md` retired
on 2026-08-15, being 296 Djinni vacancies, 190 Reddit posts and 34 Hacker News posts, fetched between
2026-08-12 20:14:17 and 2026-08-14 20:30:05, with no RSS item among them and no feed configured. That
corpus described a product that no longer exists, so it was deleted at the owner's instruction rather
than re-embedded, and 509 chunks, 509 rows of `chunks_fts` and their items went with it. A copy of the
database before the deletion was kept outside the repository.

So the twenty hour operation this document was built around never had to run here. What replaced it is
one live cycle, and the numbers of that cycle are the ones this section is really recording.

| Measure | Value |
|---|---|
| Feed | `https://www.theguardian.com/science/rss` |
| Fetched, validated, saved | 27, 27, 27 |
| Chunked | 26, one chunk per item |
| Cycle duration | 6.6 seconds, model load included |
| Stored vectors | 26, all `onnx-community/embeddinggemma-300m-ONNX` at 384 values, 1536 bytes each |

The reindex script is therefore proven on an empty case and not on a full one. Its behaviours are
covered by tests, its first real load is still ahead of it, and that is written here so nobody reads
the zero above as evidence that it can carry a corpus.

One finding arrived with the cycle and it belongs to the next phase rather than this one. The Guardian
science feed returns summaries, not articles: 27 items averaging 675 characters, the longest 1827,
against the 4128 character median that `docs/plans/article-body-cap.md` measured on Guardian articles
fetched outside the RSS path. Every item fits in one chunk. The cap raised to `articleBodyChars` is
not what limits them, the feed is, and a vertical built on feeds like this one would be a corpus of
abstracts rather than of articles.
