# Public benchmark

Status: draft
Owner: repository owner
Last change: 2026-08-14
Supersedes: none

## 1. Problem

The local bench cost a dollar, several days and a judging pass, and it can separate only large
differences. Of 50 intents, 16 have any relevant article and 11 meet the minimum of three relevant
documents TREC requires before it keeps a topic. Eleven usable topics cannot distinguish two fusion
methods or two rerankers; they can distinguish a broken retriever from a working one, and little
more.

A second problem is worse and less obvious. Nothing has ever checked the measuring code itself. If
`scripts/eval-match.js` computes normalised discounted cumulative gain incorrectly, every number this
project has produced is wrong in the same direction, and no internal comparison would reveal it,
because every configuration is scored by the same wrong function.

Both problems have the same answer and it is free. BEIR publishes 18 retrieval datasets, each with a
corpus, a query set and human relevance judgments, and public leaderboards report a standard metric
for each. Using one means the expensive half of an evaluation already exists, at a scale one person
cannot reach, and it means a published baseline exists to check our own arithmetic against.

## 2. Decision

Two BEIR datasets, SciFact and NFCorpus, become the primary bench for the engine axes: candidate
generation, fusion and reranking. They are fetched by a script rather than committed, pinned by
source and checksum. Our metric implementation is validated by reproducing the published BM25
baseline before any configuration is compared.

The local bench in `docs/plans/evaluation-corpus.md` is not replaced. It answers a question BEIR
cannot: what this product does on its own subject matter, with its own thin and keyword stuffed
content, when the right answer is nothing.

Proof of need: `docs/standards/DECISION_PROTOCOL.md` section 3.

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | Measured 2026-08-14: the local bench yields 11 topics that meet TREC's minimum, against the 50 topics TREC uses. And no check of the metric code exists, so a defect in it would be invisible |
| 2 | Cost of not doing it | Every axis is decided on 11 topics, and any error in the scoring function is undetectable. Both make the resulting configuration a guess wearing a number |
| 3 | Cheapest alternative | Grow the local bench: more intents, more judging, more dollars and more days, and still no independent check of the metric code. Rejected because the public collection is free and also solves the second problem |
| 4 | Kill criterion | Our BM25 baseline lands far from the published BM25 baseline on both datasets and the cause is not found. The harness is then not trustworthy and no axis is decided on it |
| 5 | Signal | nDCG@10 per dataset per configuration, printed by the harness and appended to `docs/eval/` next to the published baseline for the same dataset |

## 3. Scope

In scope:
- SciFact and NFCorpus from BEIR, fetched by script into `eval/beir/`.
- nDCG@10 and Recall@100, computed to BEIR's definitions so the numbers are comparable outward.
- A reproduction of the published BM25 baseline as the harness's own planted control.
- The same axis matrix the local bench will run, so the two benches answer the same questions.

Out of scope, each with its reason:
- MS MARCO and the other 16 datasets. MS MARCO is 8.8 million passages; the retrieval path here is
  JavaScript BM25 and a 384 dimension model over an in memory array. Trigger to revisit: an
  approximate nearest neighbour index exists.
- Fine tuning any model on BEIR training splits, because this project compares configurations rather
  than fitting models, and a model fitted to BEIR would then be measured on BEIR.
- Replacing the local bench, for the reason in section 2.
- Chasing a leaderboard position. The published baseline is a check on our arithmetic, not a target.

## 4. Why these two datasets

| Dataset | Corpus | Test queries | Why it earns a place |
|---|---|---|---|
| SciFact | roughly 5 thousand documents | roughly 300 | Small enough to hold in memory. Claims verified against abstracts, so relevance is precise and a wrong answer is obviously wrong |
| NFCorpus | roughly 3.6 thousand documents | roughly 320 | Small, and its queries are written by people in ordinary language against technical documents, which is the asymmetry this product actually has |

Both counts are approximate until the fetch script reports the real ones, which it records in the
manifest described in section 5.

Neither dataset is this product's domain, and that is stated plainly rather than hidden: they measure
the engine, not the product. Section 6 of `docs/plans/retrieval-quality.md` keeps the local bench
ahead of any shipping decision for exactly that reason.

## 5. Fetched, not committed

The datasets are not added to git. They are public, immutable and versioned at the source, and adding
them would roughly double the repository for no gain in reproducibility. Instead
`scripts/fetch-beir.js` writes `eval/beir/<dataset>/` and a manifest recording the source URL, the
retrieval date, the document and query counts, and a checksum of each file.

This is a deliberate exception to the rule in `docs/plans/evaluation-corpus.md` that a run must be
reproducible from git alone, and the reason it is safe here is the reason it is not safe there. Our
own snapshot came from feeds whose content changes hourly and can never be fetched again. A published
benchmark is fixed, and the checksum proves the copy on disk is the same copy the numbers came from.

`eval/beir/` is added to `.gitignore`. The manifest is committed.

## 6. The harness checks itself first

Before any configuration is compared, the harness runs BM25 alone over each dataset and compares its
nDCG@10 with the published BM25 baseline for that dataset. The published figures are read from the
BEIR paper and written into this document before the first run, so the expectation is fixed in
advance and cannot be adjusted afterwards to match whatever came out.

This is the same device as the planted controls on the judge in
`docs/plans/evaluation-corpus.md` section 9.1: a case whose answer is known before the instrument
sees it. A judge that cannot grade a known pair is not trusted with unknown ones, and a metric that
cannot reproduce a known score is not trusted with unknown configurations.

The published figures, read on 2026-08-14 and fixed here before the first run:

| Dataset | Published BM25 nDCG@10 | Our result | Verdict |
|---|---|---|---|
| SciFact | 0.665 | not yet run | |
| NFCorpus | 0.325 | not yet run | |

Tolerance, decided now rather than after seeing the result. Within 0.05 the harness is sane. Beyond
0.10 it is a defect and nothing else is measured until the cause is found. Between the two, the gap
is recorded and its cause named before any axis is compared.

The tolerance is not generous by accident. `src/eval/bm25.js` is a hand written implementation with a
short stopword list and no stemming, while published BEIR baselines run Lucene through Anserini with
full analysis. Different BM25 implementations are known to produce different numbers on the same
collection, which is why reproducing those baselines has its own literature. A gap of a few points is
therefore expected and interpretable; a gap of fifteen is not, and the first suspect is stemming.

A gap beyond tolerance is a defect in the harness or in the tokenisation, not a discovery about
BM25, and it is chased before anything else is measured.

## 7. Behaviours

1. The fetch script writes each dataset under `eval/beir/<name>/` and a manifest naming the source,
   the date, the counts and a checksum per file.
2. The loader reads a dataset from disk and performs no network request.
3. The loader reports the document count, the query count and the judgment count for a dataset.
4. Every query in a loaded dataset has at least one relevance judgment.
5. Every judged document identifier exists in the corpus of the same dataset.
6. nDCG@10 of a perfect ranking is 1.
7. nDCG@10 of a ranking with no relevant document in the top ten is 0.
8. nDCG@10 rewards a relevant document at rank one above the same document at rank ten.
9. Recall@100 of a ranking containing every relevant document is 1.
10. A graded judgment of 2 counts above a graded judgment of 1 in nDCG.
11. The harness scores a named configuration over a whole dataset and returns one row per metric.
12. The harness refuses to run when the requested dataset is absent, naming the fetch command.
13. BM25 alone on each dataset reproduces the published baseline within the tolerance recorded in
    section 6.

## 8. Tests

| # | Level | File |
|---|---|---|
| 1 | not a test | one off script, verified by behaviour 3 on its output |
| 2 | L2 | `__tests__/eval/beir-loader.test.js` |
| 3 | L2 | `__tests__/eval/beir-loader.test.js` |
| 4 | L1 | `__tests__/eval/beir-loader.test.js` |
| 5 | L1 | `__tests__/eval/beir-loader.test.js` |
| 6 | L1 | `__tests__/eval/metrics.test.js` |
| 7 | L1 | `__tests__/eval/metrics.test.js` |
| 8 | L1 | `__tests__/eval/metrics.test.js` |
| 9 | L1 | `__tests__/eval/metrics.test.js` |
| 10 | L1 | `__tests__/eval/metrics.test.js` |
| 11 | L2 | `__tests__/eval/harness.test.js` |
| 12 | L2 | `__tests__/eval/harness.test.js` |
| 13 | not a test | a measurement, recorded in `docs/eval/`, because it needs the fetched corpus and takes minutes |

Behaviours 6 to 10 are the ones that matter most and they need no corpus at all. They pin the metric
against hand written rankings whose correct score can be computed on paper, which is what makes
behaviour 13 interpretable when it fails.

## 9. Definition of done

- Every behaviour in section 7 has a passing test, except the two marked otherwise.
- `npm run verify` is green.
- The published BM25 baselines are written into section 6 before the first run.
- A report in `docs/eval/` records our BM25 number next to the published one for both datasets.
- `eval/beir/` is ignored by git and the manifest is committed.

## 10. Rollback

| If | Action | Time |
|---|---|---|
| Our BM25 lands far from the published baseline | Stop. No axis is decided until the cause is found. The gap is a defect in our code, not a finding | hours |
| A dataset proves too large for memory | Drop it and keep the other. Two were chosen so one can fail | minutes |
| The download source moves | The manifest records the URL and checksums, so a mirror can be verified against the copy that produced existing numbers | 1 hour |

## 11. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether a configuration that wins on SciFact and NFCorpus also wins on the local bench | Both benches have run the same axis matrix |
| Whether more BEIR datasets are worth adding | The two chosen disagree about which configuration wins |
| Whether the tokenisation in `src/eval/bm25.js` explains any gap from the published baseline | Behaviour 13 fails |
