# Axis C, the indexed text

Status: active
Owner: repository owner
Last change: 2026-08-18 12:15:26 +0200
Supersedes: none

## 1. Problem

Axis C of `docs/reference/retrieval-in-industry.md` section 7 is what text gets indexed, and section
8.4 of the same document names it as the axis with the largest published gains, larger than the fusion
and reranking axes this project measured before it. Its three options are the raw chunk, the chunk
with its title, and the chunk with generated document context.

Nothing on that axis had ever been measured here, and two obstacles stood in the way. Both are
recorded with their fix in `docs/plans/axis-c-indexed-text.md` section 1: the vector cache was named by
the dataset and the model alone, so a second configuration indexing different text would have read
back the first one's vectors and reported a fraction of the real difference, and the product indexes
no title at all while every public number this project has published was measured with titles indexed.

## 2. Decision

Not applicable. This document records a measurement. The decision it feeds is phase 5 of
`docs/plans/retrieval-quality.md`.

Proof of need: `docs/plans/axis-c-indexed-text.md` section 2.

## 3. Scope

In scope: the first two options of the axis, raw text against title and text, on the three public
collections, on the lexical configuration and on the hybrid one.

Out of scope: generated document context, because it costs one language model call per document and
FiQA alone holds 57638 of them. The trigger that reopens it is in section 8 of the plan document.

## 4. What was run

Four configurations, differing from their pair in the `fields` list and in nothing else, which
`__tests__/eval/harness.test.js` asserts by comparing the two objects with `fields` removed.

| Configuration | Indexed text | Branches |
|---|---|---|
| `bm25-repository-defaults` | title and text | lexical |
| `bm25-text-only` | text | lexical |
| `parallel-weighted` | title and text | lexical and dense, weighted fusion |
| `parallel-weighted-text-only` | text | lexical and dense, weighted fusion |

Model `Xenova/all-MiniLM-L6-v2`, cross encoder not involved, paired bootstrap at 10000 resamples,
95 percent interval, seed 1. Run at 2026-08-18 10:47 to 11:05 +0200.

## 5. The collections, measured before the axis was run

| Collection | Documents | Carry a title | Mean title words | Mean text words |
|---|---|---|---|---|
| SciFact | 5183 | 5183, 100 percent | 12.8 | 201.8 |
| NFCorpus | 3633 | 3633, 100 percent | 12.8 | 221.0 |
| FiQA | 57638 | 0, 0 percent | 0.0 | 132.9 |

FiQA carries no titles, which is a property of the BEIR distribution and not of this repository. That
makes it the control: this axis must move nothing there, and any number other than zero would be a
defect in the instrument rather than a finding about the axis.

## 6. Result, the lexical branch

Positive means the title helped.

| Collection | Metric | Title and text | Text only | Difference | Interval | Wins |
|---|---|---|---|---|---|---|
| SciFact | nDCG@10 | 0.6645 | 0.6483 | 0.0162 | [0.0039, 0.0304] excludes zero | 99.6 percent |
| SciFact | Recall@100 | 0.8792 | 0.8759 | 0.0033 | [0.0000, 0.0100] contains zero | 63.4 percent |
| NFCorpus | nDCG@10 | 0.3071 | 0.3023 | 0.0048 | [0.0002, 0.0097] excludes zero | 97.9 percent |
| NFCorpus | Recall@100 | 0.2346 | 0.2320 | 0.0026 | [-0.0000, 0.0053] contains zero | 97.3 percent |
| FiQA | nDCG@10 | 0.2256 | 0.2256 | 0.0000 | [0.0000, 0.0000] contains zero | control |
| FiQA | Recall@100 | 0.5027 | 0.5027 | 0.0000 | [0.0000, 0.0000] contains zero | control |

The FiQA control came back at exactly zero on both metrics, to four decimal places, which is what a
correct instrument had to produce and what the old cache key would not have produced.

## 7. Result, the hybrid configuration

| Collection | Metric | Title and text | Text only | Difference | Interval | Wins |
|---|---|---|---|---|---|---|
| SciFact | nDCG@10 | 0.7229 | 0.7075 | 0.0154 | [0.0019, 0.0297] excludes zero | 98.7 percent |
| SciFact | Recall@100 | 0.9583 | 0.9617 | -0.0033 | [-0.0100, 0.0000] contains zero | 0.0 percent |
| NFCorpus | nDCG@10 | 0.3388 | 0.3332 | 0.0056 | [0.0003, 0.0111] excludes zero | 98.0 percent |
| NFCorpus | Recall@100 | 0.3184 | 0.3114 | 0.0070 | [0.0026, 0.0121] excludes zero | 100.0 percent |
| FiQA | nDCG@10 | 0.3488 | 0.3488 | 0.0000 | [0.0000, 0.0000] contains zero | control |
| FiQA | Recall@100 | 0.6889 | 0.6889 | 0.0000 | [0.0000, 0.0000] contains zero | control |

The FiQA row of this table is the stronger half of the control, and it cost 57638 embeddings to
produce. The two configurations wrote two separate cache files, `vectors-Xenova-all-MiniLM-L6-v2-text.bin`
and `vectors-Xenova-all-MiniLM-L6-v2-title-text.bin`, so the dense branch was computed twice from
texts that differ by a leading space, being the join of an empty title. The two runs agree to four
decimal places on both metrics. The instrument adds nothing of its own.

## 8. The mechanism, and it is not the one that was expected

The title does not add its words to the document. On most documents it replaces the tail of the text,
because the encoder truncates at 256 tokens and the text alone is already longer than that.

Measured at 2026-08-18 11:05 +0200 with the model's own tokeniser, on the first 1000 documents of each
collection, rather than with the `tokensPerWord` estimate.

| Collection | Mean text tokens | Mean title tokens | Text alone over 256 tokens | Title and text over 256 |
|---|---|---|---|---|
| SciFact | 311.2 | 22.6 | 629 of 1000 | 710 of 1000 |
| NFCorpus | 340.8 | 22.5 | 751 of 1000 | 791 of 1000 |

So on roughly two thirds of SciFact and three quarters of NFCorpus the dense branch never saw the end
of the document to begin with, and prepending a title pushed 22 more tokens of it out of the window.
The title still won. Twenty two tokens of title are worth more than the twenty two tokens of body they
evict, which is a stronger statement than the one this axis set out to test.

One number falls out of the same measurement and belongs to a different open question. SciFact
averages 201.8 words and 311.2 tokens, a ratio of 1.54, while `tokensPerWord` in
`src/search-constants.js` is 1.3. The constant understates the real count by 18 percent on this
corpus, which means the chunker's decision about whether a text needs chunking at all is taken on a
number that is too small. That is the open question in `docs/reference/search-constants.md` section 10,
and this is the first measurement to bear on it.

## 9. What this says about the product

The product indexes no title. `src/scheduler.js` line 109 chunks `item.content`, and the title sits in
`item.metadata.title` where nothing embeds it and nothing searches it.

Two consequences, and the second is the uncomfortable one.

The cheap half of axis C is unspent in the product. On the two collections that can measure it, the
title is worth 0.0154 and 0.0056 nDCG@10, both intervals excluding zero, at the cost of a string
concatenation.

And every public number this project has published describes a configuration the product does not run.
`docs/eval/beir-axes-a-b.md`, `docs/eval/beir-axis-d.md` and `docs/eval/beir-axis-e.md` were all
measured with titles indexed. The gap is now quantified rather than suspected, and it is roughly
0.015 nDCG@10 on SciFact and 0.006 on NFCorpus, which is larger than the entire effect axis D
measured.

## 10. Definition of done

- Both pairs ran on all three collections and every number above carries an interval.
- The FiQA control is reported whatever it says.
- The tokeniser measurement is taken with the real tokeniser, not with `tokensPerWord`.
- The product mismatch is stated with the line of code that causes it.

## 11. Rollback

Not applicable. No runtime behaviour changed. The cache rename is covered by section 7 of
`docs/plans/axis-c-indexed-text.md`.

## 12. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the product prepends the title to every chunk, and whether that is one change or two given that the title would also enter the deduplication hash | Answered by the document that ships this axis |
| Whether generated document context is worth one model call per document, given that the cheap option returns 0.0154 at zero cost | A key exists and the title option has shipped |
| Whether `tokensPerWord` is replaced by the tokeniser that is already loaded, now that the guess is measured as 18 percent low | The chunker's skip decision is shown to fire on the wrong side of the window |
| Whether a title still helps once the window is larger, since two thirds of this evidence is about eviction rather than addition | Axis F changes the model |
