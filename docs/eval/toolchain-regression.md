# Toolchain regression check

Status: active
Owner: repository owner
Last change: 2026-08-15 14:20:47 +0200
Supersedes: none

## 1. Problem

Every number in `docs/eval/` was produced on 2026-08-14 on Node 20, ESLint 8, `better-sqlite3` 11 and
a harness that did not derive categories. On 2026-08-15 all four changed, and
`docs/adr/008-parallel-candidate-generation.md` rests on numbers taken before that.

A green suite does not answer this. The suite was green yesterday and is green today, and it never
computed nDCG on a real collection. The only thing that can say whether the measurements moved is
re-running the measurements.

## 2. Decision

Not applicable. This document records a measurement.

Proof of need: `docs/standards/DEPENDENCY_STANDARD.md` section 2 rule 6, that the version a number
was measured on is part of the number.

## 3. Scope

In scope:
- Every configuration and collection pair whose result is quoted in `docs/eval/beir-bm25-control.md`
  and `docs/eval/beir-axes-a-b.md`, re-run today and compared value by value.

Out of scope:
- Re-embedding the corpora, because the vectors are cached and the point of this check is the code
  above them. Section 6 records what that leaves unproven.
- The local news bench, because its numbers come from the same harness over the same loader and the
  public collections have thirty times the queries to disagree with.

## 4. What was run

`node scripts/eval-beir.js <configuration> <dataset>` at 2026-08-15 between 14:12 and 14:19 +0200, on
Node 24.18.0, `better-sqlite3` 13.0.3, after the three commits of today. Corpus vectors read from the
cache written on 2026-08-14 at 19:09 +0200.

## 5. Result

Recorded is the number in `docs/eval/`, taken 2026-08-14. Today is the number this run produced.

| Configuration | Collection | Metric | Recorded | Today |
|---|---|---|---|---|
| `bm25-beir-baseline` | SciFact | nDCG@10 | 0.6380 | 0.6380 |
| `bm25-beir-baseline` | NFCorpus | nDCG@10 | 0.3037 | 0.3037 |
| `bm25-beir-baseline` | FiQA | nDCG@10 | 0.2329 | 0.2329 |
| `bm25-repository-defaults` | SciFact | nDCG@10, Recall@100 | 0.6645, 0.8792 | 0.6645, 0.8792 |
| `bm25-repository-defaults` | NFCorpus | nDCG@10, Recall@100 | 0.3071, 0.2346 | 0.3071, 0.2346 |
| `bm25-repository-defaults` | FiQA | nDCG@10, Recall@100 | 0.2256, 0.5027 | 0.2256, 0.5027 |
| `dense-only` | SciFact | nDCG@10, Recall@100 | 0.6539, 0.9317 | 0.6539, 0.9317 |
| `dense-only` | NFCorpus | nDCG@10, Recall@100 | 0.3114, 0.3050 | 0.3114, 0.3050 |
| `sequential-rescore` | SciFact | nDCG@10, Recall@100 | 0.6551, 0.8792 | 0.6551, 0.8792 |
| `sequential-rescore` | NFCorpus | nDCG@10, Recall@100 | 0.3248, 0.2346 | 0.3248, 0.2346 |
| `parallel-rrf` | SciFact | nDCG@10, Recall@100 | 0.6948, 0.9583 | 0.6948, 0.9583 |
| `parallel-rrf` | NFCorpus | nDCG@10, Recall@100 | 0.3438, 0.3221 | 0.3438, 0.3221 |
| `parallel-weighted-40` | SciFact | nDCG@10, Recall@100 | 0.7229, 0.9583 | 0.7229, 0.9583 |
| `parallel-weighted-40` | NFCorpus | nDCG@10, Recall@100 | 0.3388, 0.3184 | 0.3388, 0.3184 |

Fourteen pairs, twenty two values, every one identical to four decimal places. The measured difference
is zero, not small.

The three thousand queries behind those rows ran in under thirty seconds in total, because the
lexical paths need no model and the dense paths read cached vectors. A check this cheap has no excuse
for not running after every toolchain change, and it is now the first thing to run after one.

## 6. What this proves and what it does not

It proves that the retrieval code, the fusion code, the metric code and the loader produce the same
output on Node 24 as on Node 20, and that adding category derivation to `runConfiguration` in
`src/eval/harness.js` changed no metric. Nothing in `docs/adr/008-parallel-candidate-generation.md`
moved, so the decision to generate candidates in parallel still rests on the numbers it quotes.

It does not prove that embedding is unchanged. The vectors were read from a cache computed on
2026-08-14 under Node 20, so this run exercised everything above the model and nothing inside it. A
different runtime or a different execution provider can move the last decimals of a vector, which is
why `docs/adr/013-local-inference-on-the-gpu.md` behaviour 4 asks for that comparison separately and
why a report names its device.

The honest form of the claim is therefore narrow: the arithmetic did not move. Whether the vectors
move is open until the corpora are re-embedded, and the cheapest moment to answer it is the first
run on the GPU, which has to re-embed anyway.

## 7. Behaviours

Not applicable. This document records a measurement.

## 8. Tests

Not applicable, for the same reason. The harness itself is pinned by `__tests__/eval/harness.test.js`.

## 9. Definition of done

- Every configuration and collection pair quoted in `docs/eval/` was re-run and both numbers appear
  above.
- Any difference, however small, is named rather than rounded away.

## 10. Rollback

Not applicable. No runtime behaviour changed.

## 11. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Answered 2026-08-15 14:37:11 +0200 for the runtime, and it is stronger than expected. Five SciFact documents re-embedded on Node 24 with `onnxruntime-node` 1.27 match the vectors cached on Node 20 with 1.26 bit for bit, maximum element difference 0.000e+0. The GPU half stays open | closed for the runtime, open for the device |
| Whether embedding on the GPU reproduces the same vectors | The first run under `docs/adr/013-local-inference-on-the-gpu.md` |
| Whether this check runs automatically after a dependency change rather than when someone thinks to ask | The next toolchain step lands without it |
