# Search constants

Status: active
Owner: repository owner
Last change: 2026-08-17 15:22:26 +0200
Supersedes: none

## 1. Problem

The retrieval path is steered by about thirty numbers written directly into nine source files. None of
them says where it came from. Four failures follow from that, and all four are present today.

One concept has six different values. The cosine cutoff exists as `0.65` in `src/routes/search.js`,
again as `0.65` in `src/search-engine.js`, as `0.35` in `src/config.js`, as `0.3` in
`client/src/components/FilesMode.jsx`, as `0.65` again in the `SIMILARITY_THRESHOLD` default of
`docker-compose.yml`, and as a stored setting `searchThreshold` that only `src/scheduler.js` reads.
Changing the setting in the user interface does not change what the search route does, and nothing in
the code says so. The deployed container and the local process disagree about admission by a factor
that the measurement in `docs/eval/inbox-admission.md` shows moves recall from 100 percent to 58.

A configured number does not reach the code it names. `CHUNK_SIZE` defaults to 200 and is passed as
`chunkSize`, while the default chunking strategy reads `maxChunkSize` and therefore always uses 300
words. The configured value has no effect and has never had one.

A number contradicts a measurement already in this repository. `docs/eval/inbox-admission.md` records
the semantic category at a mean similarity of 0.509 to 0.547 against its own intent, while the search
route requires 0.65. The measurement was taken, written down, and the constant was not changed.

A number contradicts the model it feeds. The active model accepts 256 tokens. Measured on
2026-08-13: a 520 word chunk produces cosine 1.0000 against the same chunk with a decisive sentence
appended, meaning the sentence was never embedded. The chunker's 300 word default sits at that edge
and nothing in the code knows the limit exists.

The common cause is that a number in source code carries no origin, and `docs/standards/STYLE.md`
forbids explaining it in a comment. So the origin has nowhere to live, and every constant becomes
folklore.

## 2. Decision

One module, `src/search-constants.js`, holds every default in the retrieval path, exported by name.
This document holds the origin and the justification for each of those names, because style rule 3
forbids that reasoning in the source file. A constant with no row here does not exist, and a row here
with no constant is a defect.

Each constant carries an origin of one of three kinds: measured, meaning a run in `docs/eval/` produced
it; borrowed, meaning a system in `docs/reference/retrieval-in-industry.md` uses it and the source is
named; arbitrary, meaning nobody knows, in which case it also carries the trigger that forces a
measurement.

Proof of need: `docs/standards/DECISION_PROTOCOL.md` section 2 excludes defect fixes, and the five
values of one cutoff described in section 1 are a defect. The single module is the cheapest
alternative to a comment, which style rule 3 forbids outright.

## 3. Scope

In scope:
- Every number that changes what search, matching, chunking or admission returns.
- The facts about the embedding model that the code depends on.
- The classification of each number as measured, borrowed or arbitrary.

Out of scope:
- Operational limits that do not change results: port, log level, cron schedule, request timeouts,
  rate limits, upload size. They stay environment driven in `src/config.js`, because changing them
  cannot change a ranking.
- Which values are correct. This document records what a value is and where it came from. Choosing a
  better one is measured in `docs/plans/retrieval-quality.md`.
- Client side defaults, which stop existing once the client sends no retrieval knobs and the server
  owns them.

## 4. Model facts

These are not tunable. They are properties of the active model that several constants must respect.

| Fact | Value | How it was established |
|---|---|---|
| Model identifier | `Xenova/all-MiniLM-L6-v2` | `src/search-engine.js` |
| Vector dimensions | 384 | Model card, and the stored BLOB layout depends on it |
| Input window | 256 tokens | Model card, confirmed by measurement on 2026-08-13: a 520 word input embeds identically with and without an appended sentence |
| Languages | English only | Measured on 2026-08-13: a Ukrainian query against a relevant English document scores 0.182, while an unrelated Ukrainian pair scores 0.562 |
| Score comparability | Not comparable across languages or lengths | Same measurement. One absolute cutoff cannot serve both languages |

## 5. The constants

Values are the ones in the repository on 2026-08-13, before any change. The origin column is the
point of this table.

| Name | Value | Lives today in | Origin | Justification, or the trigger that forces one |
|---|---|---|---|---|
| `semanticCutoffSearch` | removed | nowhere | removed by `docs/adr/011-one-cutoff-one-origin.md` at 2026-08-16 | The cosine floor on search is deleted rather than retuned. A ranked list is cut at `resultsReturned`, and the only surviving threshold is `semanticCutoffInbox`, where the product makes a binary decision |
| `semanticCutoffInbox` | 0.35 | `config.js` as `SIMILARITY_THRESHOLD` | measured, weakly | Dev half F1 peaks at 0.50, locked half peaks at 0.30 and 0.45. The two halves disagree, so the number is not settled |
| `rrfK` | 60 | `config.js`, `search-engine.js` | borrowed, source named | OpenSearch documents 60 as its default rank constant, https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/ read at 2026-08-14 17:53 +0200. The value originates in the 2009 paper that introduced the method, where it came from a pilot study and the optimum is reported as flat from roughly 20 to 100. That paper was not read directly, two attempts returned 404, so the flat optimum is held on secondary authority. Corrected 2026-08-14 17:52 +0200: this row previously credited Instacart, whose published formula has no rank constant at all |
| `bm25K1` | 1.2 | `src/eval/bm25.js` | borrowed, source named | The value Lucene ships in `BM25Similarity`, published at https://lucene.apache.org/core/9_9_1/core/org/apache/lucene/search/similarities/BM25Similarity.html and read at 2026-08-14 12:47 +0200. Elastic states the shipped defaults work for most corpora and that tuning them is not a first priority, read at 2026-08-14 12:44 +0200. Not the value behind the BEIR baseline, see `docs/plans/public-benchmark.md` section 6.1 |
| `bm25B` | 0.75 | `src/eval/bm25.js` | borrowed, source named | The same two sources, same read times. The BEIR baseline was produced at 0.4, which is Anserini's default rather than Lucene's |
| `mmrLambda` | 0.5 | `config.js`, `search-engine.js` | arbitrary | `scripts/eval-match.js` measured 1.0, meaning diversity off, as better for files mode. Never measured for internet mode |
| `scoreFloorEpsilon` | 1e-9 | `search-engine.js` | arbitrary | The floor the maximum fused score is clamped to before it divides, so a corpus where every score is zero produces zero relevance rather than a division by zero. Any small positive number does the same job. Forced by a fusion whose scores are legitimately smaller than it |
| `bm25Weight` | 0.4 | `config.js`, `search-engine.js` | arbitrary | Only used when rank fusion is disabled. Forced by axis B being measured |
| `semanticWeight` | 0.6 | `config.js`, `search-engine.js` | arbitrary | Same as above |
| `candidateLimitBm25` | 100 | `config.js`, `routes/search.js` | borrowed, loosely, source named | Anthropic retrieves 150 candidates and reranks them, quoted as "we used the top 150" at https://www.anthropic.com/engineering/contextual-retrieval read at 2026-08-14 17:41 +0200. Our 100 is not their 150 and nothing here justifies the difference. Never measured as a recall ceiling |
| `candidateLimitSemantic` | does not exist | nowhere | absent | The semantic branch has no limit because it never had its own candidate set. Forced by axis A |
| `resultsReturned` | 20 | `routes/search.js`, `search-engine.js`, `reranker.js` | borrowed, source named | Anthropic states "Passing the top-20 chunks to the model is more effective than just the top-10 or top-5", same page, read at 2026-08-14 17:55 +0200. No margin is published with it, and their measurement is of chunks passed to a model, not of results shown to a person |
| `chunkMaxWords` | 300 | `chunker/semantic.js` | arbitrary, and contradicts this repository's own ADR | Not "sits at" the window, exceeds it. 300 words at `tokensPerWord` 1.3 is 390 tokens against a 256 token encoder, and `docs/adr/004-chunking-strategies.md` states the limit as 256 tokens or about 200 words in its own first paragraph. Recorded 2026-08-16 10:27:06 +0200. The configured `CHUNK_SIZE` of 200 never reaches it |
| `chunkSizeWords` | 200 | `config.js` as `CHUNK_SIZE`, `chunker/fixed.js` | arbitrary | The window the fixed strategy slides over the text. It is also the value `CHUNK_SIZE` defaults to, and section 1 records that it never reaches the default strategy. Forced by axis C being measured |
| `chunkMinWords` | 50 | `chunker/semantic.js`, `chunker/utils.js` | arbitrary | Forced by axis C being measured |
| `chunkOverlapWords` | 50 | `config.js`, `chunker/fixed.js` | arbitrary, and the field's evidence is against it | Chroma measured that removing overlap improved intersection over union while keeping recall competitive, recorded in `docs/reference/retrieval-in-industry.md` section 8.4. Only reaches the fixed strategy, which is not the default |
| `chunkingSkippedBelowTokens` | 200 | `chunker/index.js` | arbitrary | Below this an item is stored as one chunk. Never measured against admission quality |
| `tokensPerWord` | 1.3 | `chunker/utils.js` | arbitrary | Decides whether chunking happens at all. A guess, and English specific |
| `summaryInputChars` | 4000 | `chunker/hierarchical.js` | arbitrary | How much of the document the summary call sees. Everything past it is summarised by not being read. Forced by axis C being measured on the hierarchical strategy |
| `summaryFallbackWords` | 200 | `chunker/hierarchical.js` | arbitrary | The first words kept as a summary when the language model call fails, so the strategy degrades instead of throwing. Forced by axis C, and by the open question of whether the language model paths survive at all |
| `summaryMaxTokens` | 256 | `chunker/hierarchical.js` | arbitrary | An API call shape, not a quality number. Forced by a summary truncated mid sentence |
| `summaryTemperature` | 0.2 | `chunker/hierarchical.js` | arbitrary | Not zero, so two runs of the ingest cycle can chunk the same document differently. Forced by axis C, which cannot compare two runs that disagree with themselves |
| `keywordsExtracted` | 15 | `keyword-extractor.js` | arbitrary | Fifteen terms joined by OR is the reason a single common word matches a chunk. Forced by axis D |
| `keywordTechTermBoost` | 3 | `keyword-extractor.js` | arbitrary | Forced by axis D |
| `keywordMinWordChars` | 2 | `keyword-extractor.js` | arbitrary | A word shorter than this is dropped before the frequency count, so a one letter token cannot become a search term. Forced by axis D |
| `keywordMinTextChars` | 10 | `keyword-extractor.js` | arbitrary | Below this the language model is not called and the frequency fallback answers. Forced by axis D, which measures the extractor with the language model paths disabled |
| `keywordInputChars` | 4000 | `keyword-extractor.js` | arbitrary | How much of the text the extraction call sees. A term past it cannot be extracted. Forced by axis D |
| `keywordMaxTokens` | 256 | `keyword-extractor.js` | arbitrary | An API call shape. A truncated response fails the JSON parse and falls back to frequency, which is the failure this number causes. Forced by that fallback firing on a normal query |
| `keywordTemperature` | 0.1 | `keyword-extractor.js` | arbitrary | Not zero, so the same query can produce two different keyword sets and two different result lists. Forced by axis D, for the reason recorded against `summaryTemperature` |
| `rerankBatchSize` | 5 | `reranker.js` | arbitrary | An API call shape, not a quality number. Disappears if axis E chooses a cross encoder |
| `rerankContentChars` | 500 | `reranker.js` | arbitrary | Truncates the document the reranker judges. Forced by axis E |
| `rerankMaxTokens` | 128 | `reranker.js` | arbitrary | Holds the JSON array of scores for one batch. Too small truncates the array, the parse fails and the batch keeps its original order. Forced by axis E |
| `rerankTemperature` | 0.1 | `reranker.js` | arbitrary | Not zero, so reranking the same list twice can order it differently. Forced by axis E, which compares orderings |
| `dedupCosine` | 0.95 | `config.js` | arbitrary | Conventional near duplicate cutoff, never measured on this corpus |
| `dedupWindow` | 200 | `config.js` | arbitrary | How many recent vectors a new chunk is compared against |
| `preFilterMinChars` | 50 | `scheduler.js` | arbitrary | Refuted by the locked run: thin items pass it and then score 0.741, above genuine semantic matches at 0.509 |
| `junkMinWordsToJudge` | 20 | `junk-filter.js` | measured, small sample | Dropped three keyword stuffed items with no loss of recall on the dev half |
| `junkMinDistinctRatio` | 0.5 | `junk-filter.js` | measured, small sample | Same run as above |
| `feedbackWeightStar` | 0.15 | `feedback.js` | arbitrary | How far one star moves the profile vector. No measurement of drift exists |
| `feedbackWeightApprove` | 0.1 | `feedback.js` | arbitrary | Same |
| `feedbackWeightSkip` | -0.05 | `feedback.js` | arbitrary | Same |
| `evaluationK` | 10 | `scripts/eval-match.js` | borrowed | The conventional cutoff for precision, recall and normalised discounted cumulative gain |

Counted by origin on 2026-08-13, when this table was written: two borrowed with a named source, three
measured on a small sample, one absent, and the rest arbitrary. That ratio was the finding of this
document.

Recounted at 2026-08-14 17:57 +0200, after the verification pass recorded in
`docs/reference/retrieval-in-industry.md` section 4.1: five now carry a link to a primary source and
the moment it was read, being `rrfK`, `bm25K1`, `bm25B`, `candidateLimitBm25` and `resultsReturned`.
The pass also removed one false attribution rather than adding one, which is the more valuable half.

The rest stay arbitrary, and they stay that way deliberately. The lever is not here. Elastic publishes
that tuning b and k1 is not the first thing to do, and the rank constant's own optimum is flat across
a range wider than anyone would tune within. Sources for both are in
`docs/reference/retrieval-in-industry.md` section 5.1. What moves results, on the published evidence
of the eleven systems, is what text gets indexed, whether candidates are generated in parallel, and
whether a reranker exists. Those are axes C, A and E, and they are measured rather than argued.

Closed 2026-08-16 11:07:48 +0200. Twelve names in `src/search-constants.js` had no row in either
table, and `judgeModel` carried a value that ADR-007 had changed and this document never followed.
The cause was named correctly when the gap was recorded on 2026-08-14 17:57 +0200: behaviours 1 and 2
had no test, which section 7 listed and nobody built.

`__tests__/search-constants.test.js` now exists and is the test section 7 always claimed. It reads
this document, parses both constant tables and compares the two name sets in each direction, so the
drift that produced this paragraph fails the suite instead of accumulating. The twelve rows were
written from the code and from the ADRs that introduced them, not invented.

Three rows above stopped being true on 2026-08-15 11:10:48 +0200 and the table is not rewritten until
the code moves, per the definition of done of each ADR. Recorded here so the gap is visible rather
than discovered.

`semanticCutoffSearch` is deleted, not retuned, by `docs/adr/011-one-cutoff-one-origin.md`. Search
returns the top `resultsReturned` in rank order and applies no cosine floor.
`semanticCutoffInbox` becomes the only threshold in the system and the only one a person can move.

Every row of section 4, the model facts, is void when
`docs/adr/012-embedding-model-context-window.md` picks a model. The 384 dimensions, the 256 token window
and the English only language row are properties of `Xenova/all-MiniLM-L6-v2` and of nothing else.

Phase 2 of `docs/plans/retrieval-quality.md` closed 2026-08-17 15:22:26 +0200, and it changes how the
third column is read. Every file named there now reads its number from `src/search-constants.js`, so
the column says where a value is used, not where it is written. It is written in one module.

Twelve names entered the table with that work, and none of them is new behaviour. They are the
literals the files in section 8 still carried, given the name they already had in the code. Eleven are
about the three language model calls in the retrieval path, being summarisation, keyword extraction
and reranking, and that concentration is itself a finding: the calls were configured inline and no
document had ever said what any of those numbers were for. Two of them, `summaryTemperature` and
`keywordTemperature`, are not zero, which means the ingest cycle and the extractor can disagree with
themselves between two runs of the same input. That is recorded here rather than fixed, because
changing a value in the phase that only moves values would make the phase 3 baseline uncomparable.

## 5.1 Evaluation constants

These do not change what search returns. They decide what a measurement means, so an arbitrary value
here corrupts every number the project reports and they belong under the same rule. Owned by
`docs/plans/evaluation-corpus.md`.

| Name | Value | Origin | Justification, or the trigger that forces one |
|---|---|---|---|
| `judgeProvider` | `anthropic` | measured | Chosen by `docs/adr/007-judge-on-anthropic.md` after the free Groq tier stopped the pass at 324 of 947 pairs, having spent 199,844 of 200,000 daily tokens |
| `judgeModel` | `claude-haiku-4-5` | borrowed | Chosen as a family the system itself does not use, so the judge cannot reward its own output. The value read `openai/gpt-oss-120b` in this table until 2026-08-16 11:07:48 +0200, which was stale from the day ADR-007 changed it |
| `judgeSecondModel` | `openai/gpt-oss-120b` | measured | The 324 pairs it graded before the rate limit are kept as an independent second opinion. Cohen's kappa between the two families on that overlap is 0.526, recorded in `docs/plans/evaluation-corpus.md` section 12 |
| `judgeMaxTokens` | 512 | arbitrary | A grade and one sentence of reason fit far inside it. Forced by a judgment truncated mid reason |
| `judgeInputCostPerMillion` | 1 | borrowed, from the provider's price list | Used only to print the cost of a pass. Forced when the provider reprices |
| `judgeOutputCostPerMillion` | 5 | borrowed, from the same list | The same |
| `judgeCallsPerMinute` | 25 | measured | On the tier in use the sixth consecutive raw call returned 429, recorded in `docs/plans/evaluation-corpus.md` section 9.2. The limiter in `src/groq-client.js` is what a judging pass calls through |
| `gradeMin` | 0 | borrowed | The floor of the graded scale in `docs/plans/evaluation-corpus.md` section 6. A grade outside it is rejected rather than stored |
| `gradeMax` | 3 | borrowed | The ceiling of the same scale |
| `embeddingModel` | `Xenova/all-MiniLM-L6-v2` | measured | The model the product runs, so the bench embeds what the product embeds. Changes when axis F picks a winner under `docs/adr/012-embedding-model-context-window.md` |
| `embeddingBatchSize` | 64 | arbitrary | How many texts go to the encoder at once. Forced by a measured throughput difference at another size, which nothing has taken |
| `crossEncoderModel` | `Xenova/ms-marco-MiniLM-L-6-v2` | borrowed, source named | The reranker of axis E. A cross encoder trained on MS MARCO, in the ONNX conversion the runtime this repository already depends on can load, so the axis needs no key and no new dependency. Model card read at https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2 on 2026-08-17 17:06:39 +0200. Changes when axis E picks a different reranker |
| `crossEncoderBatchSize` | 16 | measured | Throughput on this machine at 2026-08-17 17:12 +0200 was 17.8 pairs per second at batch 8, 18.8 at 16 and 17.6 at 32, so the size is chosen at the flat top of a curve rather than guessed |
| `rerankDepth` | 50 | borrowed, loosely | How many of the fused results the reranker reorders. Deep enough to move nDCG@10 and at or under the recall cutoff of 100, so behaviour 33 of `docs/plans/public-benchmark.md` holds by construction. Published practice reranks 100 to 150 candidates, quoted in `docs/reference/retrieval-in-industry.md`, and 50 is the half of that this hardware can afford at 18 pairs per second. Forced by a measured gain that is still rising at 50 |
| `calibrationSampleSize` | 60 | arbitrary | How many pairs the owner labels by hand. Forced when the kappa interval at this size is too wide to decide whether the judge passes its floor |
| `calibrationMinimumKappa` | 0.4 | borrowed, source named | The floor below which the judge is rejected. Published agreement between language model judges and human assessors is roughly 0.3 to 0.5, and UMBRELA reports 0.418 to 0.499 on TREC deep learning collections, recorded in `docs/plans/evaluation-corpus.md` section 9 |
| `judgeTemperature` | 0 | borrowed | A rerun must reproduce the answer key. Any other value makes the key drift silently |
| `judgePromptVersion` | 1 | measured | Stored on every judgment so a row graded under an older prompt is visible rather than mixed in |
| `judgeIntentChars` | 1200 | arbitrary | How much of the post the judge sees. Forced when an intent longer than this is truncated mid sentence |
| `judgeArticleChars` | 2000 | borrowed | Matches `MAX_BODY_LENGTH` in `src/sources/rss.js`, so the judge sees exactly what the system indexes |
| `gradeRelevantThreshold` | 2 | arbitrary | Grades at or above this count as relevant in binary metrics. Open question in `docs/plans/evaluation-corpus.md` section 14 |
| `trapOverlapThreshold` | 0.25 | arbitrary | Grade 0 at or above this overlap is a trap. Forced by the first report, where the trap count can be checked by hand against the named failures |
| `semanticOverlapThreshold` | 0.15 | arbitrary | Grade 2 or 3 below this overlap is a semantic match. Same trigger as the trap threshold |
| `thinArticleWords` | 50 | measured | The 2026-08-13 snapshot put 54 of 59 headline items below this and 77 of 77 news articles above it, so it separates the two corpora cleanly |
| `poolDepth` | 10 | borrowed | TREC pools the top 100 per system across dozens of systems. At eight configurations and fifty intents, ten keeps the judging budget near two thousand pairs |
| `evaluationRecallK` | 100 | borrowed, source named | The second metric BEIR reports alongside nDCG@10, so a recall number here is comparable outward. Added 2026-08-14 18:25 +0200 with `src/eval/harness.js` |
| `bootstrapResamples` | 10000 | arbitrary, bounded by cost | The resample count of the paired bootstrap. Ten thousand costs under a second on 648 queries. Forced by a comparison whose interval moves when the count is raised |
| `bootstrapAlpha` | 0.05 | borrowed, convention | A 95 percent interval, the convention this field reports. Forced by nothing, and a different level would be a presentation choice rather than a measurement |
| `bootstrapSeed` | 1 | arbitrary, and must never be tuned | Fixes the resampling so two runs agree. Choosing a seed after seeing a result would be selecting the answer, which is why behaviour 18 pins reproducibility rather than the value |
| `beirBaselineK1` | 0.9 | borrowed, source named | Anserini's default, and the value the published BEIR BM25 baseline was produced at, quoted in `docs/plans/public-benchmark.md` section 6.1 from the paper's Table 2. Used only by the control configuration, never by the product |
| `beirBaselineB` | 0.4 | borrowed, source named | The same sentence, the same source, the same restriction to the control configuration |

## 6. Behaviours

1. `src/search-constants.js` exports every name listed in section 5 of this document.
2. Every name exported by `src/search-constants.js` appears as a row in section 5 of this document.
3. Every row in section 5 whose origin is `arbitrary` carries a non empty trigger in its last column.
4. `npm run lint` fails when a module in the retrieval path contains a numeric literal other than
   zero, one, an array index or an HTTP status code.
5. The admission decision reads the stored inbox cutoff when one exists, and `search-constants`
   otherwise, so that changing the setting changes which items are admitted.
6. The chunking strategy in use receives the configured chunk size, so that changing the configured
   size changes the produced chunks.
7. Every retrieval default in `src/config.js` is the value exported by `src/search-constants.js`
   under the same concept, so no number in the retrieval path has two origins.
8. `src/search-engine.js` imports no project module other than `src/search-constants.js`, so the
   ranking functions reach no database, no configuration and no logger.

## 7. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/search-constants.test.js` |
| 2 | L1 | `__tests__/search-constants.test.js` |
| 3 | L1 | `__tests__/search-constants.test.js` |
| 4 | L1 | `__tests__/lint-magic-numbers.test.js` |
| 5 | L2 | `__tests__/scheduler.test.js` |
| 6 | L2 | `__tests__/chunker/index.test.js` |
| 7 | L1 | `__tests__/config.test.js` |
| 8 | L1 | `__tests__/search-engine.test.js` |

Behaviours 1 to 3 are checked by reading this document and the module and comparing the two name
sets. That makes the document a machine checked artefact rather than prose that drifts.

Behaviour 4 was enforced by nothing until 2026-08-17 15:22:26 +0200, and the row above said it was
enforced by a rule that had never been in any configuration. It is enforced now, and by a test rather
than by a ritual: `__tests__/lint-magic-numbers.test.js` runs ESLint over the repository's own
`eslint.config.js` through the Node API, on a fixture holding one magic number, and fails when the run
comes back clean. `docs/plans/dependency-upgrade.md` section 7 says a linter cannot lint itself and
that behaviours of that shape are checked by hand at migration time. That is true of the migration and
false of a single rule, which the API can be asked about on every run, so this one is asked.

Behaviour 5 read differently until 2026-08-17 15:22:26 +0200. It named a cosine cutoff on the search
route, which `docs/adr/011-one-cutoff-one-origin.md` deleted rather than retuned, so the line described
a number that no longer exists. The behaviour it is replaced by is the one that survived, the inbox
cutoff, and it was already covered by `__tests__/scheduler.test.js`. Rewritten rather than removed,
because a behaviour list that loses a line silently is how a document starts to disagree with the code.

Behaviour 7 is new with phase 2. Section 1 of this document opens on one concept holding six values,
and until now nothing failed when a seventh was written into `src/config.js`.

Behaviour 8 is an older check, rewritten because this work broke it. `__tests__/search-engine.test.js`
asserted that the module imports nothing from the project at all, and the only place that property was
ever written down is `docs/archive/reviews/analize1.md`, a review from before this document existed,
which `CLAUDE.md` section 3 forbids treating as a source of truth. So the check was an orphan test, and
phase 2 made it fail by giving the ranking functions their defaults by name instead of by literal.

The check is kept and narrowed rather than deleted, because what it protects is real: the ranking
functions must not reach a database, a configuration file or a logger, or they cannot be run against
a frozen corpus in the evaluation harness. Importing a frozen table of numbers does not reach any of
those. The alternative, keeping the module import free by making every caller pass every default,
changes the signature of four exported functions and would have been a behaviour change inside the
phase whose whole point is that behaviour does not change.

## 8. Definition of done

- Every behaviour in section 6 has a passing test.
- `npm run verify` is green.
- No numeric literal remains in `src/search-engine.js`, `src/routes/search.js`, `src/reranker.js`,
  `src/keyword-extractor.js`, `src/junk-filter.js`, `src/feedback.js` or `src/chunker/`.
- No default value changes in this work. Behaviour before and after is identical, which is what makes
  the baseline in `docs/plans/retrieval-quality.md` comparable to everything measured after it.

Met 2026-08-17 15:22:26 +0200, with two exceptions that are named rather than hidden.

HTTP status codes stay as literals, in `src/routes/search.js` and in the one `AppError` of
`src/chunker/index.js`. They are the protocol's numbers rather than this system's, they have no origin
to record and no axis can move them, so they are in the rule's ignore list. That is the same list the
measurement in `docs/plans/dependency-upgrade.md` section 5.4 already put them in.

The vector element size in `src/search-engine.js` is not a constant of this project either. It reads
`Float32Array.BYTES_PER_ELEMENT`, which is the language's own name for it, so the literal disappears
without a row in section 5 claiming that four is a retrieval decision.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| The lint rule blocks unrelated work | Narrow its file list to the retrieval path only | 5 minutes |
| A constant was moved and a caller was missed | The name is undefined at load, so startup fails rather than silently using zero | immediate |
| Behaviour changed by accident during the move | Re-run `node scripts/eval-match.js --report` and compare against the baseline recorded before the move | 20 minutes |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the search cutoff and the inbox cutoff should stay one number or become two | Axis A is measured, because raising recall in search will raise admission volume at the same cutoff |
| Whether `tokensPerWord` should be replaced by the real tokeniser, which is already loaded | A chunk is measured as exceeding the model window in production |
| Whether client side retrieval knobs should exist at all | The server owns the defaults and the client stops sending them |
