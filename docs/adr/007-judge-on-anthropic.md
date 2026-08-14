# ADR-007: The evaluation judge runs on Anthropic, not Groq

Status: accepted
Owner: repository owner
Last change: 2026-08-14
Supersedes: none

## 1. Problem

The judging pass over the 947 pair pool stopped after 324 judgments. The cause was measured, not
guessed: `openai/gpt-oss-120b` on the free Groq tier carries a limit of 200,000 tokens per day, and
324 judgments consumed 199,844 of them, about 617 tokens per pair. The remaining 623 pairs need
roughly 384,000 more tokens, which is two further days of waiting.

Two secondary defects appeared in the same run. The model spends tokens on internal reasoning before
answering, so the token budget per judgment is neither predictable nor controllable. And the answer
had to be parsed out of free text, which produced a class of failure the judge itself never caused.

## 2. Decision

The judge runs on Anthropic `claude-haiku-4-5` through the official `@anthropic-ai/sdk`, using
structured outputs so the grade is validated against a schema by the API rather than parsed from
text. The 324 judgments already made by `openai/gpt-oss-120b` are kept, but not as part of the answer
key: they become an independent second opinion from a different model family, and the agreement
between the two judges on those 324 pairs is reported.

Proof of need: section 3.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | On 2026-08-14 the judging pass ended with 324 of 947 pairs judged and 623 rate limited, having consumed 199,844 of the 200,000 daily tokens available for that model |
| 2 | Cost of not doing it | The answer key stays incomplete for two more days, and every axis in `docs/plans/retrieval-quality.md` waits on it. Nothing downstream can be measured meanwhile |
| 3 | Cheapest alternative | Wait two days at no cost. Rejected by the repository owner, who chose to spend money instead. The next cheapest, cutting the judge prompt and the pool, was rejected because it weakens the bench to save a dollar |
| 4 | Kill criterion | Cohen's kappa against the owner's calibration sample below 0.4, the floor recorded in `docs/reference/search-constants.md`. The judge is then rejected and the pool is labelled by hand |
| 5 | Signal | Cost per judgment and total spend printed by `scripts/judge-pool.js`, and kappa printed by `scripts/calibrate.js` and recorded in every report under `docs/eval/` |

## 4. Why this model

`claude-haiku-4-5` at one dollar per million input tokens and five per million output. The full pool
of 947 pairs is roughly 474,000 input and 47,000 output tokens, which is under one dollar for a
complete pass, including rejudging the 324 pairs the other model already covered.

It emits no internal reasoning tokens, so the cost per judgment is predictable, unlike the model it
replaces where reasoning was the larger and more variable half of the spend.

It supports structured outputs, so `{"grade": 0-3, "reason": "..."}` is enforced by the API. The
unparseable response error in `src/eval/judge.js` becomes unreachable on this path rather than
merely unlikely.

## 5. What this costs in independence

`docs/plans/evaluation-corpus.md` section 6 requires that the judge never be a model the system
itself uses. That still holds: the system uses Groq, the judge uses Anthropic.

The weaker point is honest and recorded here. The agent doing the tuning is a Claude model, and the
judge is now also a Claude model. A blind spot shared across that family would not be caught by any
internal check. Two things limit the damage. The 324 judgments from `openai/gpt-oss-120b` remain, and
the agreement between the two families on that overlap is published. And the calibration sample
labelled by the repository owner is unchanged as the only anchor to truth.

## 6. Alternatives rejected

| Option | Why not |
|---|---|
| Wait for the daily limit to reset | Two days per pass, and a corpus that grows means paying that wait again |
| Shrink the judge prompt from 2000 to 1200 characters | Was justified by a limit in `src/sources/rss.js` that no longer applies to the corpus. Still over the daily cap, so it buys a day and costs fidelity |
| Reduce pool depth from 10 to 6 | Fewer candidates per intent means more unjudged results in later runs, each counted as not relevant. Weakens the bench permanently to solve a temporary limit |
| Mix both judges, gpt-oss for the first 324 and Haiku for the rest | The split is not random. Whole intents fall on one side, so a systematic difference between judges would read as a difference between intents |
| Raw HTTP instead of the SDK | The project is Node and an official SDK exists. Hand-rolled HTTP would repeat the retry, error typing and rate limit handling the SDK already carries |

## 7. Behaviours

Covered by `docs/plans/evaluation-corpus.md` section 10. This decision adds no behaviour of its own.

## 8. Definition of done

- `@anthropic-ai/sdk` is a dependency and `ANTHROPIC_API_KEY` is documented in `.env.example`.
- The judge module selects its provider from `src/search-constants.js`, not from a literal.
- The planted controls of `docs/plans/evaluation-corpus.md` section 9.1 pass on the new judge before
  any real judgment is written.
- Agreement between the two judges on the 324 overlapping pairs is recorded in `docs/eval/`.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| Kappa falls below 0.4 | Judge rejected, pool labelled by hand. The judgments are data, not code | 1 day |
| Spend exceeds the estimate | Every judgment records its model, so the affected rows are identifiable. Stop the pass and reconsider | minutes |
| The Anthropic path fails | The Groq path stays in the module and is selected by one constant | minutes |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the two judges disagree enough to need a third | Agreement on the 324 overlapping pairs is below the human calibration floor |
| Whether structured outputs change the grade distribution against free text parsing | The 324 rejudged pairs shift by more than the run to run variation |
