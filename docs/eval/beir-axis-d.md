# Axis D, the query side

Status: active
Owner: repository owner
Last change: 2026-08-17 17:06:39 +0200
Supersedes: none

## 1. Problem

`docs/plans/retrieval-quality.md` section 1 names four measured causes of poor search, and the third
is the query side: `db.chunksSearch` is given keywords extracted by a language model or by a word
frequency fallback, joined by OR, so an exact phrase cannot be searched and any term the extractor
dropped is unreachable. That was a reading of the code. Nobody had measured what it costs.

Axis D of `docs/reference/retrieval-in-industry.md` section 7 lists four options for the query side:
raw query text, extracted keywords, hypothetical document expansion, generated intent expansion. The
last two call a language model, no key is configured and the model named in `src/config.js` no longer
exists, so this run measures the first two and defers the rest with the trigger already recorded in
`docs/plans/retrieval-quality.md` section 12.

## 2. Decision

Not applicable. This document records a measurement. The decision it feeds is phase 4 of
`docs/plans/retrieval-quality.md`.

Proof of need: the defect in section 1 of that plan, which `docs/standards/DECISION_PROTOCOL.md`
section 2 exempts from the protocol.

## 3. Scope

In scope:
- The query text against the extracted keywords, on the lexical branch, the dense branch and both.
- SciFact, NFCorpus and FiQA-2018, plus the local news bench, on nDCG@10 and Recall@100.
- Paired bootstrap intervals for the two comparisons that decide the axis.

Out of scope, each with its reason:
- Hypothetical document expansion and generated intent expansion, for the reason in section 1.
- The language model extractor. With no key the product falls back to word frequency, so the frequency
  extractor is what the product runs and what is measured.
- Any change to the product. This document measures.

## 4. What was run

Configurations added to `src/eval/harness.js`, each one the shipped `parallel-weighted` or a single
branch of it with the query transform changed and nothing else. The keyword transform is
`extractKeywordsFallback` from `src/keyword-extractor.js`, the same function the product calls, joined
by spaces because a space joined list is what a BM25 query of independent terms means.

Runs at 2026-08-17 between 16:34 and 17:02 +0200, on the vectors cached on 2026-08-14, so no
embedding was repeated and no number moved for a reason other than the axis. Clock read at
2026-08-17 17:06:39 +0200.

## 5. Result on the public collections

| Configuration | SciFact nDCG@10 | SciFact R@100 | NFCorpus nDCG@10 | NFCorpus R@100 | FiQA nDCG@10 | FiQA R@100 |
|---|---|---|---|---|---|---|
| `bm25-repository-defaults` | 0.6645 | 0.8792 | 0.3071 | 0.2346 | 0.2256 | 0.5027 |
| `bm25-query-keywords` | 0.6615 | 0.8826 | 0.3104 | 0.2345 | 0.2220 | 0.5009 |
| `parallel-weighted` | 0.7229 | 0.9583 | 0.3388 | 0.3184 | 0.3488 | 0.6889 |
| `parallel-weighted-query-keywords` | 0.7185 | 0.9583 | 0.3395 | 0.3192 | 0.3437 | 0.6845 |
| `parallel-weighted-query-keywords-both` | 0.7160 | 0.9583 | 0.3339 | 0.3183 | 0.3181 | 0.6604 |
| `dense-only` | 0.6539 | 0.9317 | 0.3114 | 0.3050 | 0.3604 | 0.7033 |
| `dense-query-keywords` | 0.6536 | 0.9343 | 0.3083 | 0.3059 | 0.3101 | 0.6416 |

`parallel-weighted-query-keywords` is the shape the product ships: keywords to the lexical branch, the
person's own text to the embedder. That was checked in the code rather than assumed, at
`src/profile-generator.js` line 43, which embeds `inputText` and not the keywords.

## 6. The keyword transform on the lexical branch is below what either bench can resolve

| Comparison | Dataset | Metric | Difference | 95 percent interval |
|---|---|---|---|---|
| `parallel-weighted` over `parallel-weighted-query-keywords` | SciFact | nDCG@10 | +0.0044 | [0.0006, 0.0091] |
| `parallel-weighted` over `parallel-weighted-query-keywords` | SciFact | Recall@100 | 0.0000 | [0.0000, 0.0000] |
| `parallel-weighted` over `parallel-weighted-query-keywords` | NFCorpus | nDCG@10 | -0.0006 | [-0.0022, 0.0011] |
| `parallel-weighted` over `parallel-weighted-query-keywords` | NFCorpus | Recall@100 | -0.0008 | [-0.0024, 0.0008] |
| `parallel-weighted` over `parallel-weighted-query-keywords` | FiQA | nDCG@10 | +0.0051 | [-0.0002, 0.0106] |
| `parallel-weighted` over `parallel-weighted-query-keywords` | FiQA | Recall@100 | +0.0044 | [-0.0021, 0.0112] |

The SciFact interval excludes zero and the difference is 0.0044, against the resolution of 0.022
measured for that collection in `docs/eval/beir-bm25-control.md` section 6.1. An interval can exclude
zero and still describe an effect too small to act on, and this is that case. On NFCorpus the sign
reverses. On FiQA the interval contains zero.

This corrects the plan rather than confirming it. The third defect of the diagnosis is real as a
description of the code, and its cost on these collections is at the edge of measurable, while axis A
was worth +0.0397 nDCG@10 and +0.0875 Recall@100 on the same bench. The order of the four causes by
size is now measured, not assumed, and the query side is last of the three tested so far.

## 7. The dense branch is where mangling the query is expensive

| Comparison | Dataset | Metric | Difference | 95 percent interval |
|---|---|---|---|---|
| `dense-only` over `dense-query-keywords` | SciFact | nDCG@10 | +0.0003 | [-0.0174, 0.0181] |
| `dense-only` over `dense-query-keywords` | NFCorpus | nDCG@10 | +0.0030 | [-0.0015, 0.0078] |
| `dense-only` over `dense-query-keywords` | FiQA | nDCG@10 | +0.0504 | [0.0374, 0.0636] |
| `dense-only` over `dense-query-keywords` | FiQA | Recall@100 | +0.0616 | [0.0438, 0.0799] |

On FiQA, stripping the query to its keywords before embedding costs 0.0504 nDCG@10 and 0.0616
Recall@100, both intervals excluding zero and both far above that collection's resolution of 0.009.
FiQA is the collection where question and answer share fewest words, which is exactly where the
embedding has to carry the meaning and where a bag of nouns carries less of it.

The product does not do this today. It is recorded because it is the cheapest looking simplification
available in this code, one function call away, and the number above is what it would cost.

## 8. The local bench, where the queries are the product's own

The dev split carries 8 answerable intents, so nothing here decides anything on its own. It is
reported because it is the only bench whose queries are real posts rather than benchmark topics.

| Comparison | Metric | Difference | 95 percent interval |
|---|---|---|---|
| `parallel-weighted` over `parallel-weighted-query-keywords` | nDCG@10 | +0.0732 | [-0.0040, 0.1739] |
| `parallel-weighted` over `parallel-weighted-query-keywords` | Recall@100 | 0.0000 | [0.0000, 0.0000] |
| `dense-only` over `dense-query-keywords` | nDCG@10 | +0.1834 | [-0.0111, 0.4473] |
| `dense-only` over `dense-query-keywords` | Recall@100 | +0.1937 | [0.0270, 0.4167] |

The last row is the one worth keeping. On this project's own corpus, with its own intents, embedding
the keywords instead of the text loses 0.1937 of Recall@100 and the interval excludes zero even at 8
topics. Both benches agree on the direction and the local one, being closer to the product, reports a
larger effect.

## 8.1 Why the public bench understates this axis, measured

| Collection | Queries | Mean words per query | Median | Mean keywords kept |
|---|---|---|---|---|
| SciFact | 300 | 12.5 | 12 | 8.5 |
| NFCorpus | 323 | 3.3 | 2 | 2.5 |
| FiQA-2018 | 648 | 10.9 | 10 | 6.0 |
| Local news intents | 8 | 97.8 | 10 | 8.9 |

Measured 2026-08-17 17:04 +0200. A three word NFCorpus title loses almost nothing to an extractor that
drops stopwords, because there is nothing to drop. That is why the axis looks small on the public
bench, and it is a property of those benchmarks rather than a property of the product.

The local intents show the shape the extractor was written for: a mean of 97.8 words against a median
of 10, meaning a handful of long posts among short titles. The long ones are where fifteen keywords
replace several hundred words, and eight topics cannot measure them separately.

## 9. Behaviours

Not applicable, this document records a measurement. The behaviours exercised are 26 to 29 of
`docs/plans/public-benchmark.md`.

## 10. Tests

Not applicable, for the same reason. The query transform is pinned by
`__tests__/eval/retrieval.test.js` with no model and no corpus.

## 11. Definition of done

- Seven configurations ran over three public collections and the local bench, and every number is
  above.
- The two comparisons that decide the axis carry intervals rather than point values.
- The result that contradicts the plan's ordering of its own defects is stated as such.

## 12. Rollback

Not applicable. No runtime behaviour changed.

## 13. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether keyword extraction should be removed from the lexical branch anyway, on the grounds that it costs nothing and buys nothing measurable | Axis D on a bench whose queries are long. The evaluation corpus grows past the 8 answerable intents of its dev split |
| Whether hypothetical document expansion and generated intent expansion are worth measuring | A language model key exists and a model that exists is named in `src/config.js` |
| Whether the fifteen keyword cap matters at all, given that the mean query keeps 8.9 | The above bench exists. Sweeping the cap on these collections would measure the cap against queries too short to reach it |
