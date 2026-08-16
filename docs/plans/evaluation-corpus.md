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

## 4.1 The local corpus mirrors the subject areas of the public collections

Added 2026-08-16 14:56:45 +0200, decided by the repository owner.

`docs/plans/public-benchmark.md` section 4 chose the public collections so that each one stands for a
subject area this engine may be sold into. That choice only pays off if the local corpus covers the
same subject areas, because otherwise the two benches answer questions about different worlds and no
result carries from one to the other.

So the sections fetched from the news publishers are chosen to match the public collections rather
than to match what is interesting to read.

| Public collection | Subject it stands for | What the local corpus collects today |
|---|---|---|
| SciFact | Science and research | Guardian `science`, and Ars Technica |
| FiQA-2018 | Finance | Guardian `business`, which is adjacent rather than identical |
| NFCorpus | Medicine and health | nothing, and this is the gap |
| held for later, CQADupStack | Technical community questions | Guardian `technology`, and Ars Technica |

Two consequences follow and both are work rather than opinion.

Health is missing. `scripts/fetch-eval-corpus.js` line 20 fetches `technology`, `science` and
`business`, so the vertical with a full public collection behind it has no local counterpart at all. A
health or society section joins that list.

Technology has the opposite problem: it is well covered locally and has no public collection that is
fetchable today, since CQADupStack is held behind the index trigger in
`docs/plans/public-benchmark.md` section 4. It stays in the local corpus, and any technology result
stands on the local bench alone until that trigger fires.

Business is kept and its imprecision is recorded rather than smoothed. FiQA is financial question
answering and Guardian business is general business reporting. They overlap, they are not the same
subject, and a configuration that wins on one is evidence about the other rather than proof.

### 4.2 The medical feeds, measured rather than chosen from a list

Added 2026-08-16 17:40:55 +0200. Three candidates were fetched and parsed with this project's own
`src/sources/feed-reader.js`, so the numbers below are what the ingest path would actually receive
rather than what a directory claims.

| Feed | Items per fetch | Median words per item | Note |
|---|---|---|---|
| `https://www.statnews.com/feed/` | 20 | 135 | The only one above the current corpus median of 126. Some items are marked STAT+ and may be partial |
| `https://www.sciencedaily.com/rss/health_medicine.xml` | 60 | 53 | The most items by far, and research derived, which is the register NFCorpus is in. Sits just above `thinArticleWords` of 50, so roughly half its items will classify as thin |
| `https://medicalxpress.com/rss-feed/` | 30 | 47 | Below the thin threshold at the median. Kept as a third source for volume, not for body quality |

All three parse. Taken together they are 110 items per fetch, which at the daily cadence of
`scripts/fetch-eval-corpus.js` reaches the scale of the existing sections within days.

STAT News and ScienceDaily are the pair to add. STAT carries the bodies, ScienceDaily carries the
volume and the research register, and Medical Xpress is held in reserve because half its items would
be classified thin before any retrieval happens.

Recorded as a measurement rather than a decision to build: `scripts/fetch-eval-corpus.js` still
fetches only `technology`, `science` and `business`, and adding these two is the work this section
authorises.

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

27. The local corpus loads in the shape a public collection loads in, so one harness scores both.
28. The local dataset carries only the intents of the requested split, and defaults to dev.
29. The local dataset reports how many of its intents have no relevant article, and leaves them out
    of the ranking metrics.

Behaviours 27 to 29 were added 2026-08-14 19:57:47 +0200. They exist because
`docs/adr/008-parallel-candidate-generation.md` decided an axis on public collections of English
scientific and medical prose, and named the absence of a check on this product's own short,
multilingual news content as the hole in that decision. One harness over both benches is the cheapest
way to close it.

Ranking metrics are computed over answerable intents only, which is what TREC does and what
section 5 of this document already separates. An intent with no relevant article scores zero for
every configuration, so including it lowers every number by the same amount while adding no
discrimination. The count of excluded intents is reported next to the score, because it is the
honest size of the bench rather than a footnote.

34. Lexical overlap is computed from the intent text and the article text, weighting each shared word
    by its inverse document frequency over the corpus.
35. A pair whose intent and article share no content word has an overlap of zero, and a pair whose
    intent words all appear in the article has an overlap of one.
36. Every judgment in a report carries a derived category, computed at report time from the grade,
    the overlap and the article properties.
37. Every judged article of a kept intent exists in the corpus of the same snapshot.

Behaviours 34 to 37 were added 2026-08-15 13:34:37 +0200 and the reason is a defect this list caused.
Section 7 defines the eight categories in terms of lexical overlap and never states, as a checkable
line, that the overlap is measured from the two texts. So `lexicalOverlap` in
`src/eval/categories.js` was written, exported and never called by anything, and `deriveCategory`
with it. Measured the same day: no script, harness or report imports either function, and 0 of the
1077 rows in `eval/judgments.json` carries a category.

The trap that made this worse than dead code is worth recording. `deriveCategory` reads
`properties.overlap ?? 0`, so a caller wired up without computing the overlap silently returns
`semantic` for every grade of 2 or 3 and `irrelevant` for every grade of 0. The two categories that
section 7 calls the ones deciding whether meaning is used at all, `trap` and `relevant`, become
unreachable without any error. Behaviour 34 exists so that the caller is required rather than
assumed, and behaviour 35 exists because a number with no stated end points can be wrong in the
middle and nobody notices.

Behaviour 37 was already tested in `__tests__/eval/local-bench.test.js` before it was written down
here, which is the same defect in the other direction: a test with no behaviour to answer to.

30. The chooser ranks candidate posts by how well the article corpus covers their subject, and keeps
    the best.
31. The chooser never reads a judgment, so selection cannot be contaminated by the answer key.
32. Pruning keeps an intent only when the answer key gives it at least three articles graded
    relevant, or when it has none at all and is kept deliberately as unanswerable.
33. Both splits carry both groups after pruning.

### 10.1 How intents are chosen, after the first attempt failed

Written 2026-08-14 20:20:28 +0200, replacing the rule that produced 8 answerable intents out of 34.

The first chooser sampled posts evenly with no regard to subject, which section 12 records as
replacing a bad selection rule with none. The corpus is 1509 business, 644 technology and 356 science
articles from two publishers. The candidate posts are 1546 from Hacker News and 50 from Reddit. Those
two populations overlap on a minority of subjects, and sampling evenly from one against the other is
close to sampling at random from the intersection.

The replacement follows what TREC does, which
`docs/reference/retrieval-in-industry.md` section 8.1 already records: the assessor searches the
collection before fixing a topic, and topics with too few relevant documents are revised or
discarded. Two steps, in this order:

Coverage first. Every candidate post is embedded, and its coverage is the mean cosine of its three
closest articles. Posts are ranked by coverage and the top ones become candidate topics. This asks
whether the corpus contains anything on the subject at all. It does not ask whether any configuration
ranks it well.

Pruning second, after judging. A topic survives when the answer key gives it at least three articles
graded 2 or 3, which is TREC's own minimum. A topic with no relevant article at all is not discarded,
it moves to the unanswerable group of section 5, where it does the job that group exists for.

The bias this carries, recorded rather than hidden. Selecting topics by embedding proximity favours
topics the embedding model represents well, so the bench will understate how badly that model handles
subjects it embeds poorly. Three things limit the damage. Coverage is computed from the corpus side,
not from any configuration's ranking, so no configuration under comparison is favoured over another.
The 26 already judged unanswerable intents are kept untouched and were selected under the old rule,
so they are not subject to this bias at all. And the alternative, judging all 1596 posts against 2509
articles, is four million pairs, which is not a choice.

## 11. Tests

Rewritten 2026-08-15 13:34:37 +0200 against the test names actually present in the suite, rather
than against what this table claimed. What it claimed and what was there had drifted apart in three
ways at once, and section 11.2 records them.

| # | Level | File | State |
|---|---|---|---|
| 1 | L2 | `__tests__/eval/corpus-loader.test.js` | passing |
| 2 | L2 | `__tests__/eval/corpus-loader.test.js` | passing |
| 3 | L2 | `__tests__/eval/corpus-loader.test.js` | passing |
| 4 | L2 | `__tests__/eval/corpus-loader.test.js` | passing |
| 5 | L2 | `__tests__/eval/corpus-loader.test.js` | passing |
| 6 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 7 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 8 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 9 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 10 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 11 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 12 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 13 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 14 | L1 | `__tests__/eval/judgments.test.js` | passing |
| 15 | L1 | `__tests__/eval/categories.test.js` | passing |
| 16 | L1 | `__tests__/eval/categories.test.js` | passing |
| 17 | L2 | `__tests__/eval/judge.test.js` | passing |
| 18 | L2 | `__tests__/eval/judge.test.js` | passing |
| 19 | L2 | `__tests__/eval/judge.test.js` | passing |
| 20 | L2 | `__tests__/eval/judge.test.js` | passing |
| 21 | L2 | `__tests__/eval/judge.test.js` | passing |
| 22 | L2 | `__tests__/eval/judge.test.js` | passing |
| 23 | L2 | `__tests__/eval/judge.test.js` | passing |
| 24 | L2 | `__tests__/eval/judge.test.js` | partial, see 11.2 |
| 25 | L2 | `__tests__/eval/judge.test.js` | missing |
| 26 | not a test | a measurement, recorded in section 9.1, because it needs the judge and a key | recorded |
| 27 | L2 | `__tests__/eval/local-bench.test.js` | passing |
| 28 | L2 | `__tests__/eval/local-bench.test.js` | passing |
| 29 | L2 | `__tests__/eval/local-bench.test.js` | passing |
| 30 | L1 | `__tests__/eval/intent-selection.test.js` | passing |
| 31 | L1 | `__tests__/eval/intent-selection.test.js` | passing |
| 32 | L1 | `__tests__/eval/intent-selection.test.js` | passing |
| 33 | L1 | `__tests__/eval/intent-selection.test.js` | passing |
| 34 | L1 | `__tests__/eval/categories.test.js` | passing |
| 35 | L1 | `__tests__/eval/categories.test.js` | passing |
| 36 | L2 | `__tests__/eval/harness.test.js` | passing |
| 37 | L2 | `__tests__/eval/local-bench.test.js` | passing |

### 11.1 What closing 34 to 36 changed, 2026-08-15 13:46:36 +0200

`lexicalOverlap` needed no correction. It was written correctly, exported, and called by nothing, so
both tests passed the moment they existed. That is the whole finding: the function was not wrong, it
was unreachable, and no test noticed because no behaviour line asked for it.

`runConfiguration` in `src/eval/harness.js` now derives a category for every result in the top
`evaluationK` of every query, from the grade in the qrels, the inverse document frequency weighted
overlap between the query text and the document text, and the article properties. A report carries
`categories`, the count per each of the eight, and `categorised`, one row per result with its grade,
its overlap and its category. Branch coverage of `src/eval/categories.js` moved from 47.72 to 84.09
percent as a side effect, which is the right order: the tests came from behaviours, and the number
followed.

One limit is recorded rather than hidden. The harness does not detect duplicates, because that needs
a cosine between two documents and a lexical configuration has no vectors. So `duplicate` is counted
as zero in every report from this path, and a zero there means not measured rather than none found.
The open question in section 13 carries it.

### 11.2 What this table got wrong, and how

Three separate failures, all of them invisible while every test was green.

The numbers pointed at the wrong lines. The row for `categories.test.js` carried number 11, which is
the behaviour about Djinni, while the two behaviours that file actually tests, 15 and 16, appeared
nowhere. Rows 3, 4 and 5 named `judgments.test.js` for behaviours that `corpus-loader.test.js` tests.
The tests themselves are named after their behaviour lines verbatim, as
`docs/standards/TESTING_STANDARD.md` section 8 requires, so the code was right and the table was
wrong.

Thirteen behaviours had no row at all: 14 through 26. Ten of them are the judge, which is the part of
this apparatus that spends money and produces the answer key, and nine of those ten do have passing
tests. The table simply stopped at 13 and resumed at 27.

Two rows are genuinely missing tests rather than missing entries, and they are named here so that
they stop being invisible. Behaviour 24 requires three distinct named errors for transport failure,
unparseable content and an unfinished response, and only the first two are tested. Behaviour 25,
that a pass reports its failed pairs and writes no answer key while any remain unresolved, has no
test at all, which is uncomfortable given that section 9.2 exists because exactly that failure
happened once already.

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

### 12.1 What fifty means, and how many of it exists

Counted from `eval/intents.json` and `eval/judgments.json` at 2026-08-16 17:40:55 +0200.

Fifty is fifty topics, not fifty documents and not fifty judgments. A topic counts toward the fifty
only when the answer key gives it at least three articles graded 2 or 3, which is TREC's own minimum
and the rule section 10.1 already adopted. A topic with one relevant article is not a hard topic, it
is an unresolvable one: every configuration either finds that single article or does not, and the
metric has nothing to rank.

| State | Intents | Dev | Locked |
|---|---|---|---|
| Three or more relevant articles, counts toward the fifty | 11 | 4 | 7 |
| One or two relevant, too thin to count | 5 | 4 | 1 |
| No relevant article, the unanswerable group of section 5 | 34 | 26 | 8 |
| Total judged | 50 | 34 | 16 |

So the bench holds 11 of the 50 topics it needs, and the working half holds 4.

The 34 unanswerable intents are not waste and are not counted as progress either. Section 5 keeps
them deliberately, to measure what the system lets through when the right answer is nothing, and they
are already judged and paid for. They simply do not contribute to ranking quality, which is what the
fifty is for.

How a topic is made, in the order that produces one:

| Step | What it does | Cost |
|---|---|---|
| Fetch | `scripts/fetch-eval-corpus.js` adds a day of articles and posts to the snapshot | network, minutes |
| Choose | Every candidate post is embedded and ranked by how well the corpus covers its subject, per section 10.1 | the embedding model, minutes |
| Pool | The union of the top results across configurations becomes the pairs to judge | minutes |
| Judge | `claude-haiku-4-5` grades each pair 0 to 3 | about a dollar per thousand pairs |
| Prune | A topic survives with three or more articles graded 2 or 3, otherwise it moves to the unanswerable group or is dropped | free |

The bottleneck is not judging and it is not money. It is coverage: a topic only survives if the
corpus already contains three articles on its subject, which is why section 4.1 aligns the corpus
with the subject areas and why more snapshot days are the cheapest way to raise the count.

## 13. Open questions

| Question | Trigger that forces an answer |
|---|---|
| How many intents are needed before a difference between configurations exceeds run to run noise. Answered 2026-08-16 17:40:55 +0200: fifty, and only fifty. An earlier answer that day offered forty as a floor, derived from this bench's own interval width. That number is withdrawn, because it is an estimate produced from a measurement taken at eight topics and it has never been checked at any other size. The target is TREC's fifty, and section 12.1 counts how far we are from it | closed |
| Whether the grade threshold for relevance is 2 or 3 | The first report shows the two thresholds ranking configurations differently |
| Whether ingestion should fetch the linked article body for the product itself, not only for the bench | Already triggered, see `docs/plans/retrieval-quality.md` section 12 |
| Whether the judge should also grade the Ukrainian holdout, given the model is multilingual | The English measurement produces a winner |
