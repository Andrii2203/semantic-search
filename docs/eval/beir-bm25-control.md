# BEIR BM25 control

Status: active
Owner: repository owner
Last change: 2026-08-14 18:25:36 +0200
Supersedes: none

## 1. Problem

Nothing had ever checked the code that produces this project's numbers. If nDCG were computed
incorrectly, every configuration would be scored by the same wrong function and no internal
comparison would reveal it. `docs/plans/public-benchmark.md` section 6 answers that with a planted
control: run BM25 alone over public collections whose BM25 score was published years ago, and compare.

The expectation was fixed in writing before the first run, along with the tolerance, so that neither
could be adjusted afterwards to match whatever came out.

## 2. Decision

Not applicable. This document records a measurement. The decision it serves is in
`docs/plans/public-benchmark.md` section 2.

Proof of need: `docs/plans/public-benchmark.md` section 2, question 1.

## 3. Scope

In scope:
- One run of each of two configurations over SciFact, NFCorpus and FiQA-2018.
- The gap to the published BM25 figure for each, and the verdict against the tolerance fixed in
  advance.

Out of scope:
- Any conclusion about which retrieval configuration is better for the product. This run measures the
  instrument, not the product.
- Semantic retrieval, fusion and reranking, which are the axes of `docs/plans/retrieval-quality.md`
  phase 4 and are not touched here.

## 4. What was run

Corpora fetched by `node scripts/fetch-beir.js scifact nfcorpus fiqa`, at 2026-08-14 16:24:17,
16:24:18 and 16:24:22 +0000, which is 18:24 +0200 local. The manifests record the moment in the
container's own zone, which is UTC, and they are the clock's reading rather than anyone's estimate.
Source URL, archive size and SHA-256 per file are in `eval/beir-manifests/`.

The counts the fetch reported match the benchmark's own published table exactly, which is the first
piece of evidence that the loader reads what it should:

| Dataset | Documents | Test queries | Judgment rows | Published corpus and queries |
|---|---|---|---|---|
| SciFact | 5183 | 300 | 339 | 5K, 300 |
| NFCorpus | 3633 | 323 | 12334 | 3.6K, 323 |
| FiQA-2018 | 57638 | 648 | 1706 | 57K, 648 |

Two configurations, both defined in `src/eval/harness.js`:

| Name | k1 | b | Fields |
|---|---|---|---|
| `bm25-beir-baseline` | 0.9 | 0.4 | title and body scored as separate fields |
| `bm25-repository-defaults` | 1.2 | 0.75 | title and body concatenated into one field |

The first exists to match the settings the published number was produced at, quoted in
`docs/plans/public-benchmark.md` section 6.1. The second is what this repository ships.

Both were run at 2026-08-14, the clock read at 18:25:36 +0200 immediately after the second finished,
the first having run within the preceding five minutes. Command:
`node scripts/eval-beir.js <configuration> scifact nfcorpus fiqa`, inside the Docker test image.

## 5. Result

| Dataset | Published | `bm25-beir-baseline` | Gap | `bm25-repository-defaults` | Gap | Verdict |
|---|---|---|---|---|---|---|
| SciFact | 0.665 | 0.6380 | -0.0270 | 0.6645 | -0.0005 | sane, both |
| NFCorpus | 0.325 | 0.3037 | -0.0213 | 0.3071 | -0.0179 | sane, both |
| FiQA-2018 | 0.236 | 0.2329 | -0.0031 | 0.2256 | -0.0104 | sane, both |

Tolerance, fixed in advance: within 0.05 the harness is sane, beyond 0.10 it is a defect. Every one of
the six numbers is inside 0.05. The largest gap is 0.027.

Recall@100, recorded because it will be the candidate generation ceiling in phase 4 and nothing
compares to it yet: SciFact 0.8842, NFCorpus 0.2391, FiQA 0.4940 under the baseline configuration.

Every gap is negative, which is the expected direction. `src/eval/bm25.js` has a 44 word stopword
list and no stemming, while the published figure came from Anserini running Lucene with full
analysis. A hand written implementation losing two to three points to a mature one, in the same
direction on all three collections, is the outcome that would have been predicted.

## 6. The finding that contradicts what was written yesterday

`docs/plans/public-benchmark.md` section 6.1 argued that running our BM25 at 1.2 and 0.75 against an
expectation produced at 0.9 and 0.4 would compare two different systems and mistake the difference for
a defect in our harness. The logic is sound. The measurement says the effect is small, and on one
collection it points the other way.

On SciFact the repository's own settings land 0.0265 closer to the published number than the settings
copied from the paper. On NFCorpus they are also slightly closer. Only on FiQA is the matched
configuration nearer, and by 0.007.

Two things follow, and neither is that section 6.1 was wrong to insist on matching.

The first is a correction of tone. The difference between the two configurations, 0.003 to 0.027, is
the same size as the gap to the published number. A run at unmatched parameters would not have
produced a false alarm here. The section stated a real principle as though it were the difference
between a working check and a broken one, and it was not.

The second is a limit on what this bench can resolve, which matters much more for phase 4. If
changing k1 from 0.9 to 1.2, b from 0.4 to 0.75, and the field structure at the same time moves
nDCG@10 by 0.027 on 300 queries, then differences of that size between two fusion methods or two
rerankers cannot be called wins without a significance test. The open question about corpus size in
`docs/plans/public-benchmark.md` section 11 is now answerable by measurement rather than by argument,
and it should be answered before the axis matrix runs.

## 6.1 How large a difference this bench can see

Measured 2026-08-14, clock read 18:52:14 +0200. Paired bootstrap over queries, 10000 resamples, 95
percent interval, seed 1, by `node scripts/compare-beir.js bm25-repository-defaults
bm25-beir-baseline scifact nfcorpus fiqa`. Paired because both configurations were scored on the same
queries, which removes the variance that comes from some queries being harder than others.

| Dataset | Metric | Difference | 95 percent interval | Verdict |
|---|---|---|---|---|
| SciFact | nDCG@10 | +0.0265 | [0.0040, 0.0488] | excludes zero |
| SciFact | Recall@100 | -0.0050 | [-0.0250, 0.0150] | contains zero |
| NFCorpus | nDCG@10 | +0.0034 | [-0.0050, 0.0119] | contains zero |
| NFCorpus | Recall@100 | -0.0045 | [-0.0125, 0.0011] | contains zero |
| FiQA-2018 | nDCG@10 | -0.0074 | [-0.0167, 0.0022] | contains zero |
| FiQA-2018 | Recall@100 | +0.0087 | [-0.0058, 0.0239] | contains zero |

The number phase 4 needs is the half width of these intervals, because it is the size a difference
must exceed before it can be called a result rather than a coincidence:

| Dataset | Queries | Resolution on nDCG@10 |
|---|---|---|
| SciFact | 300 | about 0.022 |
| NFCorpus | 323 | about 0.008 |
| FiQA-2018 | 648 | about 0.009 |

Three consequences, and the third is the one that changes the plan.

SciFact is the least sensitive of the three despite being the cleanest, and it is nearly three times
coarser than the other two. Its per query scores are close to all or nothing, because a claim's
supporting abstract is either retrieved or it is not, so the variance between queries is large. A
collection being tidy and a collection being sensitive are different properties.

The only comparison that separates is SciFact on nDCG@10, where this repository's own k1 of 1.2 and b
of 0.75 over one concatenated field beat the paper's 0.9, 0.4 and two fields, by 0.0265, winning in
98.9 percent of resamples. That is a measured result rather than an argument, and it holds on one
collection out of three while the other two say the two configurations are indistinguishable. No
consistent winner exists, which is itself the answer to whether these settings matter much.

Phase 4 now has a rule it did not have. Any axis effect below roughly 0.01 on NFCorpus or FiQA, or
below 0.022 on SciFact, is not a finding, and the matrix must report intervals rather than point
values. An axis whose effect is smaller than the interval on all three collections is not decided
here at all, and saying so will be more honest than ranking eight configurations by a fourth decimal.

## 7. Behaviours

Not applicable. This document records a measurement rather than describing running behaviour. The
behaviour it satisfies is number 13 of `docs/plans/public-benchmark.md`, which that document marks as
a measurement rather than a test.

## 8. Tests

Not applicable, for the reason in section 7. The metric implementation this run exercises is pinned
by `__tests__/eval/metrics.test.js`, and the loader by `__tests__/eval/beir-loader.test.js`.

## 9. Definition of done

- Both configurations ran over all three datasets and every number is recorded above, including the
  one that contradicts the plan.
- The published figures were written down before the run, in `docs/plans/public-benchmark.md`
  section 6, and were not edited afterwards.
- The manifests that pin the corpora are committed.

## 10. Rollback

Not applicable. This document changes no runtime behaviour.

## 11. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Answered 2026-08-14 18:52:14 +0200 in section 6.1. About 0.022 on SciFact, 0.008 on NFCorpus, 0.009 on FiQA | closed |
| Whether adding a stemmer closes the remaining two to three points | Somebody wants the gap closed. It is not needed for comparing configurations, because every configuration carries the same tokeniser |
| Whether Recall@100 on NFCorpus at 0.24 is a property of the collection or a defect here | Phase 4 measures candidate generation, where a recall ceiling that low would dominate every later stage |
