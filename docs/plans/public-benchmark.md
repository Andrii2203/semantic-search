# Public benchmark

Status: draft
Owner: repository owner
Last change: 2026-08-14 12:50:24 +0200
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

BEIR datasets become the primary bench for the engine axes: candidate generation, fusion and
reranking. They are fetched by a script rather than committed, pinned by source and checksum. Our
metric implementation is validated by reproducing the published BM25 baseline before any
configuration is compared.

Which datasets is decided by two filters applied in order. The first is the product: each dataset
stands for a subject area this engine may later be sold into, so the bench and the commercial
verticals in `docs/plans/retrieval-quality.md` section 13 are the same list rather than two lists.
The second is the hardware: the retrieval path here is JavaScript BM25 and a 384 dimension model over
an in memory array, so a collection of millions of documents is not measurable on this machine
whatever its subject. Section 4 applies both filters to the published table of all 19 datasets.

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

## 4. Which datasets, and the vertical each one stands for

The counts below are not estimates. They are the published table of the benchmark, read from
`https://github.com/beir-cellar/beir/wiki/Datasets-available` at 2026-08-14 12:41 +0200. The
availability column is the benchmark's own, and it is the column that decides more here than any
other.

Taken now, because each is under 60 thousand documents and downloads without a licence step:

| Dataset | Vertical it stands for | Corpus | Test queries | Availability |
|---|---|---|---|---|
| SciFact | Science and research | 5K | 300 | public download |
| NFCorpus | Medical and health | 3.6K | 323 | public download |
| FiQA-2018 | Finance | 57K | 648 | public download |

Held for later, with the trigger that admits each:

| Dataset | Vertical | Corpus | Test queries | Trigger |
|---|---|---|---|---|
| TREC-COVID | Biomedical literature | 171K | 50 | An approximate nearest neighbour index exists. Also 50 queries is thin for separating two configurations |
| CQADupStack | Technical community questions | 457K | 13145 | The same index. Closest public analogue to Hacker News and Reddit content |
| Quora | Duplicate question matching | 523K | 10000 | The same index |
| SCIDOCS | Citation recommendation | 25K | 1000 | Fits today. Held only because three datasets are enough to reveal disagreement, and a fourth costs judging time on every axis |

Refused, with the reason:

| Dataset | Corpus | Why not |
|---|---|---|
| MSMARCO | 8.84M | Four orders of magnitude beyond this hardware |
| BioASQ | 14.91M | Size, and availability is reproducible only, not a public download |
| NQ, HotpotQA, FEVER, Climate-FEVER, DBPedia | 2.68M to 5.42M | Size |
| TREC-NEWS, Signal-1M, Robust04 | 528K to 2.86M | Availability is reproducible only, not a public download. See the finding below |

The finding that this table produced, and it was not expected. News is the one vertical with no
freely downloadable public collection. All three news and social collections in the benchmark,
TREC-NEWS, Signal-1M and Robust04, are marked reproducible rather than public download, which means a
licence or an original corpus obtained elsewhere. News is exactly what this product ingests today.

Two consequences follow and both are recorded rather than argued. The public bench can measure this
engine on science, medicine and finance, and it cannot measure it on news at all. And the local bench
of `docs/plans/evaluation-corpus.md`, built from Guardian and Ars Technica articles, is therefore not
a duplicate of the public one. It is the only news evidence that exists here, which raises its value
rather than lowering it.

Section 6 of `docs/plans/retrieval-quality.md` keeps the local bench ahead of any shipping decision.
That ordering now has a second reason: not preference, but the absence of a public alternative.

## 5. Fetched, not committed

The datasets are not added to git. They are public, immutable and versioned at the source, and adding
them would roughly double the repository for no gain in reproducibility. Instead
`scripts/fetch-beir.js` writes `eval/beir/<dataset>/` and a manifest at
`eval/beir-manifests/<dataset>.json` recording the source URL, the moment of retrieval, the document,
query and judgment counts, the archive size and a SHA-256 of the archive and of each extracted file.
The manifest sits outside `eval/beir/` for one reason: that path is ignored by git, and a manifest
inside it would be ignored with the data it is meant to pin.

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

The published figures, now read from the primary table rather than from summaries of it. Source:
Table 2 of the BEIR paper, `https://ar5iv.labs.arxiv.org/html/2104.08663`, read at
2026-08-14 12:44 +0200.

| Dataset | Published BM25 nDCG@10 | Our result | Verdict |
|---|---|---|---|
| SciFact | 0.665 | 0.6380 at the published settings, 0.6645 at ours | sane, both inside 0.05 |
| NFCorpus | 0.325 | 0.3037 at the published settings, 0.3071 at ours | sane, both inside 0.05 |
| FiQA-2018 | 0.236 | 0.2329 at the published settings, 0.2256 at ours | sane, both inside 0.05 |

Run at 2026-08-14, clock read 18:25:36 +0200. Full report, including a result that contradicts
section 6.1 below, in `docs/eval/beir-bm25-control.md`. Behaviour 13 is satisfied and the harness is
trusted to compare configurations.

The two figures written here on 2026-08-14 from secondary sources survived contact with the primary
table unchanged. That is worth one line rather than a celebration: the expectation was fixed before
the check, and the check confirmed it.

### 6.1 What the primary table said that the summaries did not

The same sentence that carries the numbers carries their settings, and this is the part no summary
reproduced: "We use Anserini with the default Lucene parameters (k=0.9 and b=0.4). We index the title
(if available) and passage as separate fields for documents."

Two facts follow, and the second one is a defect in the plan as written yesterday.

The first is that 0.9 and 0.4 are Anserini's defaults, not Lucene's. Lucene's `BM25Similarity` ships
k1 at 1.2 and b at 0.75, published in its own API documentation at
`https://lucene.apache.org/core/9_9_1/core/org/apache/lucene/search/similarities/BM25Similarity.html`,
read at 2026-08-14 12:47 +0200. The paper names its own values correctly and mislabels their origin.
Recorded because an error inside a primary source is the one kind this project cannot catch by
demanding sources.

The second is that this repository sets `bm25K1` to 1.2 and `bm25B` to 0.75, and indexes one field.
Running that against an expectation produced at 0.9, 0.4 and two fields compares two different
retrieval systems and calls the difference a defect in our harness. The control run of behaviour 13
is therefore specified, not merely intended:

| Setting | Value for the control run | Reason |
|---|---|---|
| k1 | 0.9 | The value that produced the published number |
| b | 0.4 | The same |
| Fields | Title and body scored separately | The same. A single concatenated field is a different system |
| Stopwords and stemming | Ours, unchanged | The known and accepted source of residual gap, see below |

The product's own default stays at 1.2 and 0.75. The control run is a measurement of the instrument,
not a change to the product, and conflating the two is what this section exists to prevent.

Corrected after the run, 2026-08-14 18:25:36 +0200. The principle above is right and the size implied
by it was wrong. Both configurations were run over all three collections, and the difference between
them is 0.003 to 0.027 nDCG@10, with the repository's own unmatched settings landing closer to the
published number on two collections out of three. Running unmatched would not have raised a false
alarm. The paragraph above was written as though the settings were the difference between a working
check and a broken one, which the measurement does not support. The consequence that does matter is
recorded in `docs/eval/beir-bm25-control.md` section 6: a bench where that much movement comes from
changing three settings at once cannot resolve small differences between configurations without a
significance test.

Tolerance, decided now rather than after seeing the result. Within 0.05 the harness is sane. Beyond
0.10 it is a defect and nothing else is measured until the cause is found. Between the two, the gap
is recorded and its cause named before any axis is compared.

The tolerance is not generous by accident. `src/eval/bm25.js` is a hand written implementation with a
short stopword list and no stemming, while the published baseline runs Lucene through Anserini with
full analysis. Different BM25 implementations are known to produce different numbers on the same
collection, and the field has a reproducibility literature about exactly this, including a study
titled "Which BM25 Do You Mean?" arguing that a paper must name its variant. A gap of a few points is
therefore expected and interpretable; a gap of fifteen is not, and with k1, b and the field structure
now matched, the first remaining suspect is stemming.

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

Built 2026-08-14 18:02 +0200. Behaviours 6 to 10 are covered by `__tests__/eval/metrics.test.js` and
`src/eval/metrics.js`, ten tests passing, the five behaviours plus five edge cases that the behaviour
list did not name and the implementation would otherwise have decided silently: a relevant document
beyond k, a judgment of grade zero, a query with no relevant document at all, a ranking shorter than
k, and an unjudged document. The last one is behaviour 12 of `docs/plans/evaluation-corpus.md`
appearing again at a different level, which is a sign the two documents agree.

The definitions implemented, so that a later disagreement with a published number can be traced to a
definition rather than argued: gain is `2^grade - 1`, discount is `log2(rank + 1)` with rank counted
from one, the ideal ranking is the judged grades sorted descending and cut at k, nDCG is zero when the
ideal is zero rather than a division by zero, and recall counts every judgment above grade zero as
relevant. These are the definitions BEIR's own tooling uses, which is what makes the numbers
comparable outward.

Behaviours 1 to 5, 11 and 12 remain, and they need the fetch script that does not exist yet.

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
| Answered 2026-08-14 12:44 +0200. Whether the BM25 baselines in section 6 match the BEIR paper's own table, read directly. They do, and the table also supplied the parameters in section 6.1 | closed |
| Whether a configuration that wins on SciFact and NFCorpus also wins on the local bench | Both benches have run the same axis matrix |
| Whether more BEIR datasets are worth adding | The two chosen disagree about which configuration wins |
| Whether the tokenisation in `src/eval/bm25.js` explains any gap from the published baseline | Behaviour 13 fails |

## 12. Sources, and how the baseline number was actually obtained

A document whose central claim is that a number was read from the literature is worthless without
saying where, and this one shipped without a single link. Recorded now.

| What | Where | Read at |
|---|---|---|
| BEIR, Table 2, the BM25 figures in section 6 and the parameter sentence in section 6.1 | https://ar5iv.labs.arxiv.org/html/2104.08663 | 2026-08-14 12:44 +0200 |
| The dataset table in section 4: domains, corpus sizes, query counts, availability | https://github.com/beir-cellar/beir/wiki/Datasets-available | 2026-08-14 12:41 +0200 |
| Lucene `BM25Similarity`, its shipped k1 of 1.2 and b of 0.75 | https://lucene.apache.org/core/9_9_1/core/org/apache/lucene/search/similarities/BM25Similarity.html | 2026-08-14 12:47 +0200 |
| Elastic on k1 and b: defaults work for most corpora, and tuning them is not the first priority | https://www.elastic.co/blog/practical-bm25-part-3-considerations-for-picking-b-and-k1-in-elasticsearch | 2026-08-14 12:44 +0200 |
| Reproducing BEIR baselines, and why BM25 implementations disagree | https://cs.uwaterloo.ca/~jimmylin/publications/Kamalloo_etal_SIGIR2024.pdf | not read directly, PDF did not parse |
| BEIR, the same paper as PDF | https://arxiv.org/pdf/2104.08663 | attempted 2026-08-14 12:43 +0200, returned unparseable binary, superseded by the HTML row above |
| SciFact corpus, queries and qrels | https://huggingface.co/datasets/BeIR/scifact | not yet read |
| NFCorpus corpus, queries and qrels | https://huggingface.co/datasets/BeIR/nfcorpus | not yet read |
| FiQA-2018 corpus, queries and qrels | https://huggingface.co/datasets/BeIR/fiqa | not yet read |
| TREC topic development, cited in section 1 | https://trec.nist.gov/pubs/trec32/papers/overview_32.pdf | not read directly |

The earlier version of this section admitted that 0.665 and 0.325 came from summaries rather than from
the table, because the PDF returned unparseable binary. That is resolved. The paper's HTML rendering
carries Table 2, both numbers matched, and the same paragraph supplied the retrieval parameters that
the summaries had dropped, which turned out to matter more than the numbers did.

The rows above marked as not read are honest gaps, not omissions. Each is either not needed until the
fetch script runs, or resisted parsing in the same way the first PDF did.
