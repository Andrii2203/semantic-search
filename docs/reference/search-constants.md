# Search constants

Status: draft
Owner: repository owner
Last change: 2026-08-14
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
| `semanticCutoffSearch` | 0.65 | `routes/search.js`, `search-engine.js` | arbitrary | Contradicted by `docs/eval/inbox-admission.md`: semantic matches mean 0.509 to 0.547. Forced by axis A being measured |
| `semanticCutoffInbox` | 0.35 | `config.js` as `SIMILARITY_THRESHOLD` | measured, weakly | Dev half F1 peaks at 0.50, locked half peaks at 0.30 and 0.45. The two halves disagree, so the number is not settled |
| `rrfK` | 60 | `config.js`, `search-engine.js` | borrowed | The constant from the original reciprocal rank fusion work, and the value Instacart and OpenSearch both use |
| `mmrLambda` | 0.5 | `config.js`, `search-engine.js` | arbitrary | `scripts/eval-match.js` measured 1.0, meaning diversity off, as better for files mode. Never measured for internet mode |
| `bm25Weight` | 0.4 | `config.js`, `search-engine.js` | arbitrary | Only used when rank fusion is disabled. Forced by axis B being measured |
| `semanticWeight` | 0.6 | `config.js`, `search-engine.js` | arbitrary | Same as above |
| `candidateLimitBm25` | 100 | `config.js`, `routes/search.js` | borrowed, loosely | Anthropic reranks the top 150. Never measured here as a recall ceiling |
| `candidateLimitSemantic` | does not exist | nowhere | absent | The semantic branch has no limit because it never had its own candidate set. Forced by axis A |
| `resultsReturned` | 20 | `routes/search.js`, `search-engine.js`, `reranker.js` | borrowed | Anthropic measured the top 20 window as better than 5 or 10 |
| `chunkMaxWords` | 300 | `chunker/semantic.js` | arbitrary | Sits at the model's 256 token window, see section 4. The configured `CHUNK_SIZE` of 200 never reaches it |
| `chunkMinWords` | 50 | `chunker/semantic.js`, `chunker/utils.js` | arbitrary | Forced by axis C being measured |
| `chunkOverlapWords` | 50 | `config.js`, `chunker/fixed.js` | arbitrary | Only reaches the fixed strategy, which is not the default |
| `chunkingSkippedBelowTokens` | 200 | `chunker/index.js` | arbitrary | Below this an item is stored as one chunk. Never measured against admission quality |
| `tokensPerWord` | 1.3 | `chunker/utils.js` | arbitrary | Decides whether chunking happens at all. A guess, and English specific |
| `keywordsExtracted` | 15 | `keyword-extractor.js` | arbitrary | Fifteen terms joined by OR is the reason a single common word matches a chunk. Forced by axis D |
| `keywordTechTermBoost` | 3 | `keyword-extractor.js` | arbitrary | Forced by axis D |
| `rerankBatchSize` | 5 | `reranker.js` | arbitrary | An API call shape, not a quality number. Disappears if axis E chooses a cross encoder |
| `rerankContentChars` | 500 | `reranker.js` | arbitrary | Truncates the document the reranker judges. Forced by axis E |
| `dedupCosine` | 0.95 | `config.js` | arbitrary | Conventional near duplicate cutoff, never measured on this corpus |
| `dedupWindow` | 200 | `config.js` | arbitrary | How many recent vectors a new chunk is compared against |
| `preFilterMinChars` | 50 | `scheduler.js` | arbitrary | Refuted by the locked run: thin items pass it and then score 0.741, above genuine semantic matches at 0.509 |
| `junkMinWordsToJudge` | 20 | `junk-filter.js` | measured, small sample | Dropped three keyword stuffed items with no loss of recall on the dev half |
| `junkMinDistinctRatio` | 0.5 | `junk-filter.js` | measured, small sample | Same run as above |
| `feedbackWeightStar` | 0.15 | `feedback.js` | arbitrary | How far one star moves the profile vector. No measurement of drift exists |
| `feedbackWeightApprove` | 0.1 | `feedback.js` | arbitrary | Same |
| `feedbackWeightSkip` | -0.05 | `feedback.js` | arbitrary | Same |
| `evaluationK` | 10 | `scripts/eval-match.js` | borrowed | The conventional cutoff for precision, recall and normalised discounted cumulative gain |

Counted by origin: two borrowed with a named source, three measured on a small sample, one absent, and
the rest arbitrary. That ratio is the finding of this document.

## 5.1 Evaluation constants

These do not change what search returns. They decide what a measurement means, so an arbitrary value
here corrupts every number the project reports and they belong under the same rule. Owned by
`docs/plans/evaluation-corpus.md`.

| Name | Value | Origin | Justification, or the trigger that forces one |
|---|---|---|---|
| `judgeModel` | `openai/gpt-oss-120b` | borrowed | Chosen as a family the system itself does not use, so the judge cannot reward its own output. Verified live against the provider on 2026-08-13 |
| `judgeTemperature` | 0 | borrowed | A rerun must reproduce the answer key. Any other value makes the key drift silently |
| `judgePromptVersion` | 1 | measured | Stored on every judgment so a row graded under an older prompt is visible rather than mixed in |
| `judgeIntentChars` | 1200 | arbitrary | How much of the post the judge sees. Forced when an intent longer than this is truncated mid sentence |
| `judgeArticleChars` | 2000 | borrowed | Matches `MAX_BODY_LENGTH` in `src/sources/rss.js`, so the judge sees exactly what the system indexes |
| `gradeRelevantThreshold` | 2 | arbitrary | Grades at or above this count as relevant in binary metrics. Open question in `docs/plans/evaluation-corpus.md` section 14 |
| `trapOverlapThreshold` | 0.25 | arbitrary | Grade 0 at or above this overlap is a trap. Forced by the first report, where the trap count can be checked by hand against the named failures |
| `semanticOverlapThreshold` | 0.15 | arbitrary | Grade 2 or 3 below this overlap is a semantic match. Same trigger as the trap threshold |
| `thinArticleWords` | 50 | measured | The 2026-08-13 snapshot put 54 of 59 headline items below this and 77 of 77 news articles above it, so it separates the two corpora cleanly |
| `poolDepth` | 10 | borrowed | TREC pools the top 100 per system across dozens of systems. At eight configurations and fifty intents, ten keeps the judging budget near two thousand pairs |

## 6. Behaviours

1. `src/search-constants.js` exports every name listed in section 5 of this document.
2. Every name exported by `src/search-constants.js` appears as a row in section 5 of this document.
3. Every row in section 5 whose origin is `arbitrary` carries a non empty trigger in its last column.
4. `npm run lint` fails when a module in the retrieval path contains a numeric literal other than
   zero, one, or an array index.
5. The search route resolves its cosine cutoff from the stored setting when one exists, and from
   `search-constants` otherwise, so that changing the setting changes what search returns.
6. The chunking strategy in use receives the configured chunk size, so that changing the configured
   size changes the produced chunks.

## 7. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/search-constants.test.js` |
| 2 | L1 | `__tests__/search-constants.test.js` |
| 3 | L1 | `__tests__/search-constants.test.js` |
| 4 | not a test | enforced by the `no-magic-numbers` rule in `.eslintrc.json`, scoped to the retrieval path |
| 5 | L3 | `__tests__/routes/search.test.js` |
| 6 | L2 | `__tests__/chunker/index.test.js` |

Behaviours 1 to 3 are checked by reading this document and the module and comparing the two name
sets. That makes the document a machine checked artefact rather than prose that drifts.

## 8. Definition of done

- Every behaviour in section 6 has a passing test.
- `npm run verify` is green.
- No numeric literal remains in `src/search-engine.js`, `src/routes/search.js`, `src/reranker.js`,
  `src/keyword-extractor.js`, `src/junk-filter.js`, `src/feedback.js` or `src/chunker/`.
- No default value changes in this work. Behaviour before and after is identical, which is what makes
  the baseline in `docs/plans/retrieval-quality.md` comparable to everything measured after it.

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
