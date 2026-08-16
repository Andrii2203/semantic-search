# ADR-011: The search cutoff is deleted, the inbox cutoff is the only threshold

Status: accepted
Owner: repository owner
Last change: 2026-08-15 11:10:48 +0200
Supersedes: none

## 1. Problem

The literal `0.65` is the most expensive number in this repository and nobody chose it.

`docs/reference/search-constants.md` section 1 records one concept living at six values:
`src/routes/search.js` line 20, `src/search-engine.js` line 58, `src/validation.js` line 91 as a Zod
default, `docker-compose.yml` line 17 as `SIMILARITY_THRESHOLD:-0.65`, against `0.35` in
`src/config.js` line 80 and `.env.example`, and `0.3` sent by the files screen of the client. The
deployed container and the local process disagree about admission, and the setting a person moves in
the interface never reaches the search route at all.

Its value is contradicted by this repository's own measurements. `docs/eval/inbox-admission.md`
records genuine semantic matches at a mean of 0.509 to 0.547, below the cutoff, and records recall
falling to 58 percent at 0.65 on both halves. `docs/reference/search-constants.md` classifies it as
arbitrary in origin.

And it is about to get worse. `docs/adr/008-parallel-candidate-generation.md` makes both branches
generate candidates over the whole corpus, and `docs/plans/retrieval-quality.md` section 7 records
that parallel retrieval with the cutoff left at 0.65 returns almost nothing, because the cutoff
removes the candidates the new shape exists to find.

## 2. Decision

The cosine floor on search is deleted rather than retuned. Search returns the top `resultsReturned`
results in rank order and applies no similarity threshold at all.

One threshold survives, `semanticCutoffInbox`, and it applies where the product makes a binary
decision: whether an item enters a person's inbox. It is resolved at runtime from the stored setting,
falling back to `src/search-constants.js`, so the control in the interface changes what the system
does.

The literal `0.65` stops existing in the repository outside of documents that record its history.

## 3. Proof of need

Not required. `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes, and six values of
one concept, plus a configured value that never reaches the code it names, are defects already
recorded in `docs/reference/search-constants.md` section 1. This ADR exists because deleting a
concept rather than moving it is a decision that outlives the fix.

## 4. Why deleting beats retuning

A ranked list and an admission decision are two different questions, and this project already wrote
that down. `docs/standards/EVALUATION_STANDARD.md` section 5 states that ranking metrics apply to the
search screen where order is what the person sees, and that the confusion matrix at the production
threshold describes the inbox. A cosine floor on a ranked list answers the inbox question in the
search screen, where nobody asked it.

The field agrees, and `docs/reference/retrieval-in-industry.md` section 5 point 2 already records it:
candidate generation optimises recall over hundreds of items and reranking optimises precision over
tens. None of the eleven systems in section 4 filters a ranked list by an absolute cosine value.
There is a reason beyond convention. `docs/reference/search-constants.md` section 4 records that
scores from this model are not comparable across languages or lengths, measured at 0.182 for a
cross language pair against 0.562 for an unrelated same language pair. One absolute cutoff over
scores that are not comparable removes documents by their language and length rather than by their
relevance.

Retuning would also have to be redone twice. Once when `docs/adr/008-parallel-candidate-generation.md`
lands and the candidate set changes, and again when `docs/adr/012-embedding-model-context-window.md`
changes the model and with it the entire scale on which 0.65 meant anything.

## 5. What changes, named exactly

Read from the source on 2026-08-15 between 11:00 and 11:10 +0200, clock read once at 11:10:48 +0200.

| Place | Today | After |
|---|---|---|
| `src/routes/search.js` line 20 | `threshold: 0.65` in the defaults | Removed. The route ranks and cuts at `resultsReturned` |
| `src/search-engine.js` line 58 | `scoreChunksByVector(chunks, profileVector, threshold = 0.65)` | The parameter is removed. Scoring returns scores, the caller decides what to keep |
| `src/validation.js` line 91 | `threshold: z.number().min(0).max(1).default(0.65)` | Removed from the search request schema. The client sends no retrieval knobs |
| `docker-compose.yml` line 17 | `SIMILARITY_THRESHOLD:-0.65` | The default in compose is deleted. One default lives in `src/search-constants.js` |
| `.env.example`, `src/config.js` line 80 | `SIMILARITY_THRESHOLD=0.35` | Kept, and it means the inbox cutoff only |
| `client/src/components/FilesMode.jsx` | Sends `0.3` | Sends nothing. The server owns the value |
| `src/scheduler.js` line 215 | `config.live('searchThreshold')` for admission | Unchanged in shape, renamed to the inbox cutoff so its name says which decision it makes |

## 6. Trade-offs

What is given up: a search that returns twenty results for a query with no good answer, rather than
returning nothing. That is the honest behaviour of a ranked list and it is what every search engine
does, but it will look worse on a query with an empty correct answer than a threshold that returned
nothing did.

Two things limit the damage. The 26 unanswerable intents in `eval/intents.json` exist to measure
exactly this case, recorded in `docs/plans/evaluation-corpus.md` section 5. And the inbox, which is
where an unwanted item actually costs attention, keeps its threshold.

What is bought: the cutoff stops silently deleting the recall that
`docs/adr/008-parallel-candidate-generation.md` measured at 0.0875 on NFCorpus and 0.3059 on this
project's own news bench.

## 7. Behaviours

1. A search request that sends a threshold returns the same results as one that does not.
2. Search returns at most `topN` results, ordered by score, with no score based exclusion.
3. Search over a corpus where every chunk scores below 0.65 still returns results.
4. Both branches generate candidates over the whole corpus by default, so a chunk containing no query
   keyword can be returned.
5. The admission decision reads the stored inbox cutoff when one exists, and `search-constants`
   otherwise.
6. Changing the inbox cutoff setting changes which items are admitted on the next cycle.
7. No file under `src/` contains the literal 0.65.

Behaviour 1 was written on 2026-08-15 as "rejected as an unknown field" and corrected on
2026-08-16 11:07:48 +0200, because the premise was wrong. `SearchRequestSchema` in
`src/validation.js` is exported and used by nothing: `src/routes/search.js` reads the body directly
in `readSearchRequest`. So the search route has never validated its input against that schema, and a
behaviour promising rejection would have described a check that does not exist. The schema's
`threshold` field is removed with the rest, and the honest behaviour is that the field is ignored.

That is the third artefact found this way in two days, after `src/eval/categories.js` and the
`no-magic-numbers` rule, and all three shared one shape: something written, exported and never wired
to a caller.

Behaviour 4 belongs to axis A rather than to this ADR, and it is listed here because
`docs/plans/retrieval-quality.md` section 7 requires the two to land in one commit. Measured
separately each looks like a failure.

## 7.1 Tests

| # | Level | File |
|---|---|---|
| 1 | L3 | `__tests__/routes/search.test.js` |
| 2 | L3 | `__tests__/routes/search.test.js` |
| 3 | L2 | `__tests__/search-engine.test.js` |
| 4 | L3 | `__tests__/routes/search.test.js` |
| 5 | L2 | `__tests__/scheduler.test.js` |
| 6 | L2 | `__tests__/scheduler.test.js` |
| 7 | L1 | `__tests__/search-constants.test.js` |

Behaviour 7 is a test that reads the source files, which is unusual and is the point: the defect this
ADR fixes was one concept written as a literal in six places, and only a check over the text can stop
it returning.

## 8. Definition of done

- Every behaviour in section 7 has a passing test.
- `npm run verify` is green, including the `no-magic-numbers` rule of
  `docs/reference/search-constants.md` behaviour 4.
- `docs/reference/search-constants.md` section 5 carries `semanticCutoffSearch` as removed, with this
  ADR as the reason, and `semanticCutoffInbox` as the only surviving threshold.
- The open question in `docs/reference/search-constants.md` section 10, whether the two cutoffs become
  two numbers, is closed by this ADR: one of them ceases to exist.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| Search results become visibly noisy on real queries | A reranker is the answer this project already planned as axis E, not a return of the floor | measured, not guessed |
| An inbox fills after the search change | The inbox cutoff is a live setting and moves without a deploy | 1 minute |
| The removal changes files mode for the worse | Files mode sent 0.3, which was already close to no filter. Re-measure with `scripts/eval-match.js` against the baseline recorded before the change | 20 minutes |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| What value the inbox cutoff takes once the model changes | `docs/adr/012-embedding-model-context-window.md` produces a winner. Every threshold measured on `all-MiniLM-L6-v2` is void on a different model |
| Whether the inbox needs a per source cutoff | One source floods the inbox at a threshold that serves the others. There is no per language question, because measurement is English only per `docs/plans/retrieval-quality.md` section 5 |
