# ADR-012: Ukrainian becomes a supported language, so the embedding model changes

Status: accepted
Owner: repository owner
Last change: 2026-08-15 11:10:48 +0200
Supersedes: docs/plans/retrieval-quality.md section 5, the part that holds Ukrainian out of scope

## 1. Problem

The active model does not work in the language the owner actually uses.

`docs/reference/search-constants.md` section 4 records the measurement, taken on 2026-08-13 with this
repository's own code: a Ukrainian query against a relevant English document scores 0.182, while an
unrelated Ukrainian pair scores 0.562. A pair that is wrong in content but right in language beats a
pair that is right in content. No threshold, fusion method or reranker can recover from that
ordering, because the ordering is produced before any of them run.

Two further properties of the same model are defects of their own. The input window is 256 tokens,
and a 520 word chunk was measured to embed identically with and without an appended decisive
sentence, meaning the tail is silently discarded. And `chunkMaxWords` is 300, which sits past that
edge.

`docs/plans/retrieval-quality.md` section 5 answered this by declaring English the measurement
language and Ukrainian a holdout that is never tuned against. That was the right call for isolating
five axes from one large effect. It is the wrong call for a product whose owner writes intents in
Ukrainian, and it has now been kept long enough that every number in `docs/eval/` describes a language
the product is not used in.

## 2. Decision

Ukrainian stops being a holdout and becomes a supported language. Axis F, the embedding model, is
promoted from phase 6 to run next to phase 4 rather than after it, because every threshold, weight and
cutoff measured on the current model is void the moment the model changes.

The model is chosen by measurement between the named candidates in section 4, on the public
collections for statistical power and on a Ukrainian set for the product's real traffic. The model
identifier and the vector dimension are stored per vector, so both models can coexist during a
reindex.

## 3. Proof of need

Not required for the defect half. `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect
fixes, and a retrieval order that ranks language above content is a defect measured on 2026-08-13.

Required and answered for the scope change, which is making a second language a target:

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | The measured 0.182 against 0.562 above, plus the retirement of Djinni in `docs/adr/010-sources-narrowed-to-user-feeds.md`, which removed the only reason the Ukrainian content in the product was treated as a contaminant of the bench rather than as the traffic |
| 2 | Cost of not doing it | The product works in a language its owner does not write in. Every axis result in `docs/eval/` is then evidence about English news retrieval and not about this product |
| 3 | Cheapest alternative | Translate the query into English before embedding, using the language model path that already exists. Rejected: it adds a network call and a failure mode to every search, and `docs/plans/retrieval-quality.md` section 12 already records that the configured Groq model no longer exists and no key is set |
| 4 | Kill criterion | No multilingual candidate beats `all-MiniLM-L6-v2` on the English public collections by more than their measured resolution, and the Ukrainian set stays below usable. The model is then not the lever and the corpus is |
| 5 | Signal | nDCG@10 and Recall@100 per candidate on SciFact, NFCorpus and FiQA, next to the same two metrics on the Ukrainian set, in one table in `docs/eval/` |

## 4. The candidates, with their sources

Read on 2026-08-15 between 10:55 and 11:10 +0200. The clock was read once at 11:10:48 +0200 and these
stamps are fitted backwards into that window, per `docs/standards/DOCUMENT_TEMPLATE.md`. They are
correct to within about fifteen minutes and in the right order, and they are not to the second.

| Model | Dimensions | Context | Languages | Runs in this stack | License | Source |
|---|---|---|---|---|---|---|
| `Xenova/multilingual-e5-small`, the current baseline's closest replacement | 384 | 512 tokens | 100, from the XLM-R set, Ukrainian included | Yes, ONNX, 136,286 downloads on the Hub | MIT | https://huggingface.co/api/models?search=multilingual-e5-small read 2026-08-15 11:05 +0200 |
| `onnx-community/embeddinggemma-300m-ONNX` | 768, truncatable to 512, 256 or 128 by Matryoshka | 2048 tokens | over 100 | Yes, ONNX, built for Transformers.js, 173,621 downloads | Apache 2.0 | https://huggingface.co/blog/embeddinggemma read 2026-08-15 11:02 +0200 |
| `Qwen/Qwen3-Embedding-0.6B` | up to 1024, user defined from 32 | 32,000 tokens | over 100 | ONNX conversion not verified. The reranker of the same family is on the Hub as `onnx-community/Qwen3-Reranker-0.6B-ONNX`, the embedder was not confirmed | Apache 2.0 | https://huggingface.co/Qwen/Qwen3-Embedding-0.6B read 2026-08-15 11:04 +0200 |
| `BAAI/bge-m3` | 1024 | 8192 tokens | over 100, dense, sparse and multi vector in one model | ONNX conversions exist, not verified for this runtime | MIT | Secondary source only, see section 8 |

The reranker that pairs with any of them, for axis E, is `onnx-community/bge-reranker-v2-m3-ONNX`,
19,949 downloads, multilingual, read at https://huggingface.co/api/models?search=reranker+ONNX on
2026-08-15 11:06 +0200. It removes the dependency on a language model API that
`docs/adr/003-reranking-strategy.md` chose because the API was already there.

Two claims are recorded as unverified rather than left to look verified. EmbeddingGemma is described
by its publisher as the highest ranking text only multilingual model under 500M parameters on MTEB at
the time of its release, and Ukrainian is not listed explicitly in that post, only "over 100
languages". Qwen3-Embedding-0.6B reports 64.33 mean on the MTEB multilingual board on its own model
card. Neither number was checked against a leaderboard read directly, and MTEB v2 scores are reported
elsewhere as not comparable to v1, so no ranking between families is claimed here.

## 4.1 The paid alternatives, and why they are not on the list

Added 2026-08-15 11:43:15 +0200, because the question was asked and an unasked option is the kind
that returns every month.

The hosted embedding APIs of 2026 are Gemini Embedding, Cohere Embed v4, OpenAI text-embedding-3-large
and Voyage. Reports from 2026 put Gemini Embedding and the Qwen3 family at the top of the multilingual
leaderboards, with Cohere and OpenAI as the common defaults in retrieval systems. All of these were
read from 2026 comparison articles surfaced on 2026-08-15 at 11:33 +0200, and none from a publisher's
own page, so no number from them is quoted here.

They are not on the candidate list for three reasons, none of which is quality.

The product embeds continuously. Every ingested item is chunked and embedded, and a person following
twenty feeds produces hundreds of items a day. A hosted embedder turns that into a per item cost and
a per item network failure, forever, against a local model that costs electricity.

`docs/adr/001-hybrid-search.md` recorded working offline as a property worth keeping, and every
measurement in `docs/eval/` was produced without a key. An answer key computed against an API that is
retired or repriced is not reproducible, which is the same failure
`docs/adr/007-judge-on-anthropic.md` already hit once with a model that stopped existing.

The judge already spends money, at about one dollar per full pool, and that spending buys something a
local model cannot provide. Spending again on the embedder buys quality that four Apache 2.0 and MIT
models in section 4 already deliver at this corpus size.

The trigger that would reopen this: a measured gap on the Ukrainian bench where every local candidate
fails and a hosted model succeeds. Then the cost is worth paying and this row becomes an ADR of its
own.

One piece of guidance from the same 2026 reading is worth keeping regardless of which model wins. The
overall MTEB average mixes classification, clustering and reranking with retrieval, and only the
retrieval column describes what this product does. A model chosen by the headline average is chosen
on tasks this system never performs.

## 5. What decides it

Two benches, both of which already exist.

The English public collections of `docs/plans/public-benchmark.md` give the statistical power, and
their resolution is known: 0.022 nDCG@10 on SciFact, 0.008 on NFCorpus, 0.009 on FiQA, measured in
`docs/eval/beir-bm25-control.md` section 6.1. A candidate that loses more than that to the current
model on English is rejected however well it does in Ukrainian, because English is what the product
indexes most of.

A Ukrainian set, which stops being a holdout and becomes a bench with an answer key built the same
way as the local news bench. Until it exists, the only Ukrainian evidence is the four pair
measurement of 2026-08-13, and one number from four pairs decides nothing.

## 6. Consequences

The stored vector layout stops being an assumption. `docs/reference/search-constants.md` section 4
records that 384 dimensions is a property the BLOB layout depends on. Every candidate except
`multilingual-e5-small` changes it, so the model identifier and the dimension are stored per vector
before any reindex begins.

The 256 token window defect closes as a side effect. Every candidate carries at least 512 tokens and
EmbeddingGemma carries 2048, which puts `chunkMaxWords` of 300 back inside the window rather than at
its edge.

Every measured number in `docs/eval/` becomes a number about the old model. That is not a loss, it is
the reason `docs/standards/EVALUATION_STANDARD.md` section 4 requires the configuration to be
recorded with the score. The baseline stays comparable because the old model stays runnable.

EmbeddingGemma requires instruction prefixes, `task: search result | query: ` for a query and
`title: none | text: ` for a document, published in the source read at 2026-08-15 11:02 +0200. A
prefix applied on one side only is a silent quality defect, so it belongs in the code that embeds,
next to the model identifier, and not in a caller.

## 7. Definition of done

- Every vector row carries the model identifier and the dimension that produced it.
- Each candidate ran over SciFact, NFCorpus and FiQA, with intervals, and the table is in `docs/eval/`.
- A Ukrainian bench with an answer key exists, and the winner's number on it is recorded whatever it
  says.
- The chosen model's required prefixes are applied in the embedding path, and a test asserts the
  query prefix and the document prefix differ.
- `docs/reference/search-constants.md` section 4 is rewritten for the new model facts.

## 8. Rollback

| If | Action | Time |
|---|---|---|
| The new model degrades English retrieval beyond the bench's resolution | Model identifier and dimension are stored per vector, so the old vectors stay valid. Reindex back | 1 hour |
| The Ukrainian bench cannot be built for lack of content | The decision holds on the defect alone, and the model is chosen on the English collections plus the four pair check repeated at scale | days |
| A candidate has no usable ONNX build | It leaves the list. Two of the four are confirmed to run in this runtime today | minutes |

## 9. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether Ukrainian is explicitly in the language list of each candidate, from the model card rather than from "over 100 languages" | Before the first run. It is a five minute check and it decides which candidates are even eligible |
| Whether asymmetric query and document modes, which `docs/reference/retrieval-in-industry.md` records at DoorDash, beat symmetric embedding here | The winner supports both modes |
| Whether one cutoff can serve two languages, given scores are not comparable across them | The Ukrainian bench produces its first admission numbers |
| Whether Matryoshka truncation to 256 dimensions costs measurable quality, since it would cut storage by two thirds | EmbeddingGemma wins and the corpus grows past what memory holds |
