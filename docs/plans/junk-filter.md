# Junk filter

Status: active
Owner: repository owner
Last change: 2026-08-13
Supersedes: none

## 1. Problem

The first honest measurement of inbox admission, recorded in `../eval/inbox-admission.md` at commit
`fba115b`, found that keyword stuffed junk scores higher against an intent than genuinely relevant
text does.

On the dev split, similarity of an item to its own intent:

| Category | Mean |
|---|---|
| exact | 0.766 |
| duplicate | 0.761 |
| spam | 0.597 |
| partial | 0.556 |
| semantic | 0.547 |

Spam outranks both partial matches and the semantic matches, which are the entire reason for using
embeddings rather than keywords. At the production threshold of 0.35, precision is 63 percent: more
than a third of what reaches the inbox was not wanted, and three of the four dirty admissions are
keyword stuffed spam.

Raising the threshold does not fix it. At 0.50 precision reaches 71 percent and spam is still
admitted; above 0.55 recall collapses, because the semantic items sit at 0.535 to 0.558, in the same
band as the spam. Any threshold that excludes this spam also excludes the matches the product exists
to find.

The conclusion the numbers force: this is not a ranking problem, it is an input problem. The text
should not reach the embedding step at all.

## 2. Decision

Extend the deterministic pre filter in the ingest cycle with one repetition rule, applied before any
embedding: text whose vocabulary is mostly repeats of the same few words is dropped.

Proof of need: not required, this is a defect found by measurement, per `../standards/DECISION_PROTOCOL.md`
section 2. The measurement is the trigger.

Why deterministic and not the language model classifier that `PLAN_v7.md` describes: the classifier
costs about 0.0005 dollars per item forever, and the measured separation here is wide enough that a
single free rule does the job. The paid option stays deferred, with the trigger it already has.

## 3. Scope

In scope: one rule, one constant, applied in the existing pre filter, with the dataset as a
regression fixture.

Out of scope:

- Promotional phrase lists (buy now, click here). No measurement shows they add anything the
  repetition rule does not already catch, and blocklists age badly.
- Language model classification of junk. Already deferred with its trigger.
- Near duplicate suppression in the inbox. It is a different problem, already handled at chunk level
  by the near dedup step, and the measurement does not show it hurting.

## 4. Behaviours

1. An item whose words are mostly repeats, under half of them distinct, is dropped before embedding.
2. The rule only applies to text long enough to judge, twenty words or more.
3. Every item the labelled dataset marks as relevant survives the filter.
4. Every item the labelled dataset marks as spam is dropped by the filter.
5. A dropped item is counted in the cycle result, so the number of items filtered stays visible.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/junk-filter.test.js` |
| 2 | L1 | `__tests__/junk-filter.test.js` |
| 3 | L1 | `__tests__/junk-filter.test.js` |
| 4 | L1 | `__tests__/junk-filter.test.js` |
| 5 | L2 | `__tests__/scheduler.test.js` |

Behaviours 3 and 4 use `src/seed-dataset.js` as the fixture. That is deliberate: the labels were
written before the filter existed, so the filter is judged against an answer key it did not shape.

## 6. Definition of done

- The five behaviours pass.
- `npm run verify` is green.
- The dev split is measured again after the change and the numbers are appended to the report.
- The locked split is run once, after the change is finished, and appended.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| Real content is dropped | Lower the constant, or gate the rule behind a setting | 5 min |
| The rule catches nothing in production | Remove it, the measurement said it should catch spam | 5 min |

## 8. Open questions

- The spam in the dataset is written by us and is crude. Real search engine spam is subtler and may
  pass this rule. Trigger to revisit: one item in a real inbox that a person calls junk and that this
  filter let through.
