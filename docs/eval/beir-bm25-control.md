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
| How large a difference in nDCG@10 on these collections is real rather than noise | Already triggered by section 6. Needs a significance test or a bootstrap over queries, before the phase 4 matrix is read |
| Whether adding a stemmer closes the remaining two to three points | Somebody wants the gap closed. It is not needed for comparing configurations, because every configuration carries the same tokeniser |
| Whether Recall@100 on NFCorpus at 0.24 is a property of the collection or a defect here | Phase 4 measures candidate generation, where a recall ceiling that low would dominate every later stage |
