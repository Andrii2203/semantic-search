# Evaluation corpus for internet search

Status: draft
Owner: repository owner
Last change: 2026-08-14
Supersedes: none

## 1. Problem

Internet search is the broken path, and it is the one path with no answer key.

`scripts/eval-match.js` measures files mode against synthetic resumes. `docs/eval/inbox-admission.md`
measures admission, which is a threshold decision on one item, not an ordering of many. Neither can
say whether a change to retrieval made internet search better or worse, and four defects are waiting
to be fixed with no way to prove that fixing them helped.

Three further facts were measured on 2026-08-13 and they shape everything below.

There was nothing to search. In a 59 item snapshot of what the product ingests, 54 items carried
fewer than 50 words and 26 of 29 Hacker News items had content identical to their own title. A nine
word headline cannot be retrieved by meaning, because it carries a topic and no content.

Topical overlap between a day of Hacker News and a day of one news publisher is thin. Measured by
overlap of content words, 4 posts of 59 had a strong match in a 77 article corpus, 9 had a moderate
one, and 46 had none. A single day's snapshot cannot carry 50 usable intents.

Exhaustive labelling is impossible. Fifty intents against a corpus of hundreds is tens of thousands
of pairs, and this is a project with one person.

## 2. Decision

The corpus is news articles with real bodies, taken from two publishers over RSS and frozen as dated
snapshots. The intents are real posts from Hacker News and Reddit, taken from the same snapshots, so
that no intent is invented. The answer key is produced by a language model judge that returns one
graded relevance number per pair, calibrated against human labels on a sample, and the eight
categories of the evaluation standard are derived arithmetically rather than judged. Only the pooled
top results of the configurations under comparison are judged.

Proof of need: `docs/standards/EVALUATION_STANDARD.md` section 1 states that nothing in the
repository measures the product's central promise, and section 7 requires a run reproducible from
git. Recorded as ADR-009.

## 3. Scope

In scope:
- Dated snapshots under `eval/snapshots/`, each holding articles and posts as fetched.
- A judge that grades an intent and article pair from 0 to 3, with a pinned model, temperature zero
  and a committed prompt.
- Derivation of the eight categories from the grade and from measurable properties.
- Pooled judging: only the union of the top results across configurations is judged.
- A calibration set labelled by the repository owner, and the agreement statistic published with
  every result.

Out of scope:
- Live fetching during a run, because two runs of one configuration would see different content and
  the comparison would be meaningless.
- Djinni content, because it is predominantly Ukrainian and would reintroduce the language effect
  that `docs/plans/retrieval-quality.md` section 5 isolates out.
- Training a model on these judgments, because the judgments exist to compare configurations, not to
  fit one.
- Replacing the resume corpus of files mode, because nothing there is broken.

## 4. The snapshot

`scripts/fetch-eval-corpus.js` writes one dated directory per run. It is safe to run daily, and the
corpus grows, which is how the topical overlap problem in section 1 is solved: more days means more
chances that a post and an article speak about the same subject.

| File | Contents |
|---|---|
| `eval/snapshots/<date>/corpus.json` | News articles. Ars Technica, Guardian technology, Guardian science |
| `eval/snapshots/<date>/posts.json` | Hacker News and Reddit posts, the raw material for intents |
| `eval/intents.json` | The posts promoted to intents, by identifier, across all snapshots |
| `eval/judgments.json` | The answer key: one graded row per intent and article pair |
| `eval/calibration.json` | The subset labelled by hand, and the agreement statistic |

A report names the snapshots it ran against. Numbers from different snapshot sets are never compared
directly.

Measured on the 2026-08-13 snapshot: 77 articles, median 126 words, minimum 27, maximum 322, against
59 posts. Compare that with the headline corpus this replaced, where the median was 9 words.

## 5. Two groups of intents

Intents are split deliberately, because a bench made only of answerable questions measures half the
product.

Answerable intents have at least one article graded 2 or 3. They measure recall and ordering.

Unanswerable intents have no article above 0. They measure what the system lets through when the
right answer is nothing, which `docs/standards/EVALUATION_STANDARD.md` section 3 names as the more
interesting question. An unanswerable intent is not a defect in the corpus and is never removed to
make a score look better.

Target proportion is roughly two thirds answerable. Both groups carry the dev and locked split.

## 6. The judge

The judge is given the intent text and the article text and returns one number.

| Grade | Meaning |
|---|---|
| 3 | The article is squarely about what the person is interested in |
| 2 | The same subject, seen from a different angle |
| 1 | A related subject that does not address the interest |
| 0 | A different subject |

Three rules make the judge an instrument rather than an opinion.

The model is pinned by exact identifier and the temperature is zero, so a rerun reproduces the answer
key. The identifier and the prompt version are stored on every judgment row, so a judgment made under
an older prompt is visible rather than silently mixed in.

The judge model is never a model the system itself uses. If the same model reranked results and then
graded them, it would be rewarding its own output. This is why reranking in
`docs/plans/retrieval-quality.md` axis E is measured with a local cross encoder.

The judge sees one pair at a time and never sees a ranking, a position, or which configuration
produced the candidate. It cannot prefer a system it cannot see.

Smoke tested on 2026-08-13 with `openai/gpt-oss-120b`: a Reddit post about Twitch training Amazon AI
against an Ars Technica article on the same subject was graded 3, and the same post against an
article about a solar eclipse was graded 0, both with a one sentence reason.

## 7. Categories are derived, not judged

Asking a language model to choose among eight categories asks it to make the judgement this project
argues about most. Instead the grade is combined with measurable properties.

| Category | Derivation |
|---|---|
| `relevant` | grade 3 |
| `partial` | grade 1 |
| `irrelevant` | grade 0 and lexical overlap below the trap threshold |
| `trap` | grade 0 and lexical overlap at or above the trap threshold |
| `semantic` | grade 2 or 3 and lexical overlap below the semantic threshold |
| `thin` | article word count below the thin threshold |
| `spam` | `src/junk-filter.js` reports keyword stuffing |
| `duplicate` | cosine to another article at or above `dedupCosine` |

Two consequences. `trap` and `semantic`, the two categories that decide whether meaning is being used
at all, become measurable definitions instead of matters of taste. And the thresholds involved are
constants, so they live in `src/search-constants.js` with an origin, per
`docs/reference/search-constants.md`.

## 8. Pooled judging, and its bias

Every configuration under comparison runs over every intent. The union of the top results from each
configuration is the pool, and only the pool is judged. This is the method TREC has used since the
nineties, where the pool is the union of the top hundred documents from each participating system.

The bias is recorded rather than hidden: an article that no configuration retrieved is treated as not
relevant even if it was. This favours configurations that were in the pool when it was built. Two
rules limit the damage. A configuration added later triggers a new judging pass over its unjudged top
results before its numbers are quoted. And the count of unjudged results in a run is reported next to
the score, so a run that reached far outside the pool declares it.

## 9. Calibration, and what may be quoted

The repository owner labels a stratified sample of pairs, without seeing the judge's grades. Cohen's
kappa between the two is computed and published with every result that depends on the judge.

The reason this is not optional is measured elsewhere. Published agreement between language model
judges and human assessors on individual labels is fair, roughly 0.3 to 0.5, while agreement on the
ordering of systems is high, roughly 0.8 to 0.9. The UMBRELA judge reports 0.418 to 0.499 on
TREC deep learning collections.

The rule that follows: an individual judgment is never quoted as truth, and the ordering of
configurations is what the reports state. A claim of the form "this article is relevant" is not
supported by this method. A claim of the form "configuration A ranks better than configuration B" is.

Both assessors see the same evidence, byte for byte. The calibration screen slices the intent and
the article with `judgeIntentChars` and `judgeArticleChars`, the same constants the judge uses, and
it prints where the article was cut. This is not a nicety. Agreement between two assessors who read
different amounts of text measures the difference in what they were shown as if it were disagreement
about relevance.

The first implementation got this wrong, which is worth recording because the error is easy to make
and invisible once made. The judge received 2000 characters of the article and 1200 of the intent,
while the calibration screen showed 1400 and 900. On the 2026-08-13 snapshot the judge sees about 48
percent of a median article and the person would have seen 34, and 2380 of 2509 articles are longer
than the judge's own limit, so the mismatch would have touched nearly every pair in the sample.

## 9.1 Controls on the judge

Calibration in section 9 is the anchor to truth, and it costs human time. Four automatic controls run
before it and cost nothing, because their correct answers are known in advance. They are mixed into
the judging stream undeclared, so the judge cannot treat them differently.

| Control | Pair | Correct answer | Catches |
|---|---|---|---|
| Identity | An article as its own intent | 3 | Gross failure, a broken prompt, a wrong field |
| Unrelated | Two articles from different sections | 0 | A judge that grades everything high |
| Overlap trap | Two articles sharing over half their content words but telling different stories | 0 or 1 | The bias that matters most here, a judge that rewards word overlap and therefore rewards lexical retrieval |
| Test retest | The same pair judged twice at temperature zero | Identical | Instability, and a silently changed model behind the same identifier |

Measured on 2026-08-13 with `openai/gpt-oss-120b`: identity 5 of 5, unrelated 3 of 3, overlap trap 5
of 5. The overlap trap result is the one that matters. Pairs at 0.57 to 0.63 word overlap, all
British economic reporting sharing most of their vocabulary but covering different stories, were
graded 0 and 1. A judge that graded those high would have made every lexical configuration look
correct and the whole comparison in `docs/plans/retrieval-quality.md` would have been worthless
without anyone noticing.

## 9.2 A failure is never a grade

The first run of these controls reported failures that were not the judge's. Rapid calls returned
HTTP 429, the probe labelled the empty response as truncation, and the test retest control then
reported five of five identical, because two absent grades compare equal. A green check measuring
nothing is worse than a red one, and at two thousand pairs it would have filled the answer key with
silent holes that no test in this repository would have caught.

Four rules follow, and they are behaviours rather than intentions.

A judge call returns a grade of 0 to 3 or it raises. There is no default grade, no null coerced to a
number, and no fallback to the previous value.

Transport failure, unparseable content, and a response that did not finish are three distinct named
errors. They are never collapsed into one.

The judging pass calls through `src/groq-client.js`, which already carries a rate limiter, never
through a raw request. Measured on the current tier: the sixth consecutive call returns 429.

A pass reports how many pairs failed and why, and a pass with unresolved failures does not write an
answer key.

## 10. Behaviours

1. The loader reads a snapshot from disk and performs no network request.
2. Two loads of the same snapshot produce items in the same order.
3. Every article carries the fields the ingest path expects.
4. Every intent carries an identifier and free text.
5. Every intent is a post that exists in a snapshot, not invented text.
6. Every judgment names an intent that exists and an article that exists.
7. Every judgment carries a grade of 0, 1, 2 or 3.
8. Every judgment records the judge model identifier and the prompt version.
9. Every intent carries a split of either dev or locked.
10. Every derived category present in the judgments appears in both splits.
11. No article in a snapshot has source equal to djinni.
12. A pair with no judgment is reported as not relevant.
13. An intent with no article graded above 0 is reported as unanswerable.
14. Both groups of intents are present, answerable and unanswerable.
15. The eight categories of the evaluation standard are the only ones produced.
16. The category of a judgment is derived from its grade and the article properties, not stored by the
    judge.
17. The judge returns a grade and a reason for one intent and article pair.
18. The judge asks with temperature zero so a rerun reproduces the answer key.
19. The judge never sees a ranking position or the configuration that retrieved the article.
20. A grade outside zero to three is rejected rather than stored.
21. The judge is not called for a pair that already carries a judgment from the same model and prompt
    version.
22. A pair judged under an older prompt version is judged again.
23. A judge call returns a grade of 0 to 3 or raises, never a default and never a null.
24. Transport failure, unparseable content and an unfinished response raise three distinct named
    errors.
25. A judging pass reports the count of failed pairs and writes no answer key while any remain
    unresolved.
26. The planted controls of section 9.1 are graded correctly by the judge in use.

## 11. Tests

| # | Level | File |
|---|---|---|
| 1 | L2 | `__tests__/eval/corpus-loader.test.js` |
| 2 | L2 | `__tests__/eval/corpus-loader.test.js` |
| 3 | L1 | `__tests__/eval/judgments.test.js` |
| 4 | L1 | `__tests__/eval/judgments.test.js` |
| 5 | L1 | `__tests__/eval/judgments.test.js` |
| 6 | L1 | `__tests__/eval/judgments.test.js` |
| 7 | L1 | `__tests__/eval/judgments.test.js` |
| 8 | L1 | `__tests__/eval/judgments.test.js` |
| 9 | L1 | `__tests__/eval/judgments.test.js` |
| 10 | L1 | `__tests__/eval/judgments.test.js` |
| 11 | L1 | `__tests__/eval/categories.test.js` |
| 12 | L4 | `__tests__/eval/judge.test.js` |
| 13 | L2 | `__tests__/eval/judge.test.js` |

Reporting the count of unjudged results belongs to the harness, which section 3 puts out of scope
here. It is carried into `docs/plans/retrieval-quality.md` phase 3 rather than left unwritten.

Behaviours 3 to 11 are checks on the committed answer key itself, which makes the key an artefact the
suite defends. The stratification mistake found by hand in `docs/eval/inbox-admission.md`, where every
spam item sat in dev and every thin item sat in locked, then fails the suite instead of being
discovered after a run has already been spent.

## 11.1 The runbook

Four commands, in order. The first three need no person. The fourth is the only one that does.

| Step | Command | Needs |
|---|---|---|
| Snapshot the sources | `node scripts/fetch-eval-corpus.js` | Network, once |
| Choose the intents | `node scripts/choose-intents.js 50` | Nothing |
| Build the pool | `node scripts/build-pool.js` | The embedding model, a few minutes |
| Judge the pool | `node scripts/judge-pool.js` | A Groq key, about an hour, resumable |
| Calibrate | `node scripts/calibrate.js` | The repository owner, sixty keypresses |

The judging pass is resumable because the queue is the file: a pair without a judgment is work left to
do. Killing the process and running it again continues from the same place, which is what makes an
hour of API calls safe to interrupt.

`scripts/calibrate.js` never shows the judge's grade, because a human who sees the machine's answer
first is no longer an independent assessor and the agreement statistic would measure suggestion
rather than agreement.

## 12. Definition of done

- Every behaviour in section 10 has a passing test.
- `npm run verify` is green.
- A clone can run the evaluation with no network access and no API key.
- The calibration set is labelled by hand and Cohen's kappa is recorded in `docs/eval/`.
- The count per derived category is written into `docs/eval/`, per split.
- The fetch script and the judge script are committed and are not part of any run of the suite.

## 13. Rollback

| If | Action | Time |
|---|---|---|
| Cohen's kappa against the owner falls below 0.4, under the published range for a state of the art judge | The judge is rejected. Fall back to hand labelling the pool only, which is the same size. Decided before the first run, per `docs/standards/DECISION_PROTOCOL.md` question 4 | 1 day |
| A planted control fails | The pass stops. No answer key is written from a judge that cannot grade a known answer | immediate |
| A snapshot is too small to separate two configurations | Run the fetch again on later days and rejudge only the new pairs | minutes, plus judge time |
| A judgment is found to be wrong | Correct it in its own commit, before the next run, with the reason. Never inside a tuning change | 5 minutes |
| The judge model is retired by the provider | Every judgment records its model, so the affected rows are identifiable and rejudged | 1 hour |

## 14. Open questions

## 12. What the first complete run produced

Run of 2026-08-14, judge `claude-haiku-4-5`, prompt version 1, all three planted controls passed,
947 judgments, zero failures, one dollar.

| Grade | Judgments |
|---|---|
| 0, a different subject | 821 |
| 1, related but not addressed | 57 |
| 2, same subject another angle | 35 |
| 3, squarely about it | 34 |

Relevant, meaning grade 2 or 3, is 7.3 percent of the pool. Non-zero of any kind is 13.3 percent.

Two judges from different families independently graded the same 324 pairs, because the earlier run
on `openai/gpt-oss-120b` stopped at a rate limit rather than by design. That accident is the most
useful number here.

| Measure | gpt-oss-120b against claude-haiku-4-5 |
|---|---|
| Exact agreement on the 0 to 3 grade | 89 percent |
| Within one grade | 98 percent |
| Agreement on relevant or not | 97 percent |
| Cohen's kappa | 0.526 |

That kappa sits above the 0.418 to 0.499 range UMBRELA reports against human assessors on TREC deep
learning collections. It does not establish that either judge is right. It does make it unlikely that
either is answering at random, and it was obtained without spending any of the owner's time.

### The intents were chosen wrongly, and the field already knew better

Of 50 intents, 16 have at least one article graded 2 or 3, and only 11 have the three relevant
articles TREC requires before it keeps a topic. Thirty four have none at all.

The cause is in this document's own selection step. After the lexical overlap metric proved broken,
`scripts/choose-intents.js` was changed to sample posts evenly with no regard to subject, which
replaced a bad selection rule with none. Hacker News over 180 days is mostly programming culture:
kernel escapes, a Common Lisp image tool, a language release. No news publication covers any of it,
so the correct answer for those intents is genuinely empty, and the zero says nothing about
retrieval.

Section 9 of `docs/reference/retrieval-in-industry.md` records what TREC actually does: the assessor
searches the collection before fixing a topic, and topics with too few relevant documents are revised
or discarded. Checking that an answer exists is procedure. Only looking at a system's ranking is
contamination. The rule written here at first, never look at the corpus, was stricter than the field's
and produced a bench where two intents in three are unanswerable.

What survives the error: 26 intents with no correct answer are exactly the group section 5 wants for
measuring what the system lets through when the right answer is nothing, and they are already judged
and paid for. What is missing is the other half, and it is rebuilt by choosing intent sources whose
subject matter the corpus covers, then keeping only topics with at least three relevant articles.

## 13. Open questions

| Question | Trigger that forces an answer |
|---|---|
| How many intents are needed before a difference between configurations exceeds run to run noise | The baseline records its own variation across repeated runs. TREC settled on 50 topics, which is the working target |
| Whether the grade threshold for relevance is 2 or 3 | The first report shows the two thresholds ranking configurations differently |
| Whether ingestion should fetch the linked article body for the product itself, not only for the bench | Already triggered, see `docs/plans/retrieval-quality.md` section 12 |
| Whether the judge should also grade the Ukrainian holdout, given the model is multilingual | The English measurement produces a winner |
