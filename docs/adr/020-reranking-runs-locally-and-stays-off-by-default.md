# ADR-020: Reranking runs locally, and stays off by default

Status: accepted
Owner: repository owner
Last change: 2026-08-17 18:15:34 +0200
Supersedes: `docs/adr/003-reranking-strategy.md`

## 1. Problem

`docs/adr/003-reranking-strategy.md` chose language model reranking on Groq, in batches of five, and
rejected a local cross encoder in one line as "точно, але повільно і heavy". It carries no number on
either side. It also wrote the trigger that would reopen it, "якщо потрібен offline, cross-encoder
model".

Two things happened to it since.

The chosen path stopped running. `src/config.js` names a Groq model that no longer exists and no key
is configured, so `src/reranker.js` cannot score anything today. The feature is optional and defaults
to off, which is why nothing broke loudly.

The rejected path was measured. `docs/eval/beir-axis-e.md` runs a 6 layer MS MARCO cross encoder
locally through the runtime this repository already depends on, over four benches, and the rejection
of 2026 does not survive contact with the numbers: it costs no key, no dependency and no money, and it
reaches published BM25+CE quality on three public collections.

## 2. Decision

Reranking, when it runs, runs locally on a cross encoder. It stays optional and off by default.

The Groq reranking path is not the product's reranker any more. It is not deleted in this decision,
because deleting it belongs with the wider question of whether the language model paths survive at
all, which axis D and axis E were asked to inform and which
`docs/plans/retrieval-quality.md` section 12 still holds open.

Proof of need: section 3 below, and the trigger ADR-003 wrote for itself, which fired.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | The configured Groq model does not exist and no key is set, so the shipped reranker cannot run. Measured with the cross encoder on 2026-08-17: it reaches 0.6899, 0.3528 and 0.3647 nDCG@10 on SciFact, NFCorpus and FiQA, within 0.018 of the published BM25+CE figures for the same collections |
| 2 | Cost of not doing it | The product keeps a reranking feature that fails on every call, and the only reranker that can run here stays unmeasured behind a line of prose written without a number |
| 3 | Cheapest alternative | Restore the Groq path with a current model and a key. Rejected as the default because it costs money per query, needs a key the deployment does not have, and cannot be measured on the benches this project runs, which have no network budget for tens of thousands of pairs |
| 4 | Kill criterion | A corpus where the local reranker loses and the language model one wins, measured on the same queries. On this evidence the reranker's own quality is the ceiling it imposes, so a first stage above that ceiling is the case that kills it, and SciFact is already that case |
| 5 | Signal | nDCG@10 with a paired bootstrap interval, per collection, in `docs/eval/` |

## 4. Why it stays off by default

Because the measurement refuses a global answer, and shipping it on would be deciding what the
measurement declined to decide.

| Collection | First stage | Reranked | Effect |
|---|---|---|---|
| SciFact | 0.7229 | 0.6899 | loses 0.0330, interval excludes zero |
| NFCorpus | 0.3388 | 0.3528 | wins 0.0140, interval excludes zero |
| FiQA | 0.3488 | 0.3647 | wins 0.0158, interval touches zero |
| local news | 0.4581 | 0.5400 | wins 0.0819, 8 topics, interval contains zero |

`docs/eval/beir-axis-e.md` section 6 gives the mechanism: the cross encoder pulls the top of the
ranking towards its own quality, so it raises a weak first stage and lowers a strong one. A default
that helps two collections and harms a third is a per corpus setting, not a default, and this is the
same shape as axis B in `docs/eval/beir-axes-a-b.md` section 7.2.

The second reason is latency, and it is recorded rather than measured against a budget that does not
exist: at 18 pairs per second, reranking twenty results costs about a second, against a search that
answers in tens of milliseconds.

## 5. Scope

In scope:
- The choice of reranker for this product, from language model scoring to a local cross encoder.
- The status of `docs/adr/003-reranking-strategy.md`, which becomes superseded.

Out of scope:
- Deleting `src/reranker.js` or `groq-sdk`, for the reason in section 2.
- Rewriting `src/reranker.js` onto the cross encoder. That is code, it belongs to the phase that ships
  the phase 4 winners, and it is not done inside a measurement phase, per the rule this plan has
  followed since `docs/eval/beir-axes-a-b.md` section 12.
- Reranking in the ingest path. Admission is a threshold decision on one item, not an ordering.

## 6. Behaviours

Not applicable. This decision changes no runtime behaviour on its own. The behaviours that carry the
measurement are 30 to 33 of `docs/plans/public-benchmark.md`, and the behaviours that will carry the
product change belong to the document that ships it.

## 7. Tests

Not applicable, for the same reason.

## 8. Definition of done

- `docs/adr/003-reranking-strategy.md` carries a superseded status naming this file.
- The numbers in section 4 exist in `docs/eval/beir-axis-e.md` with their intervals.
- The product change is written down as not done, with the document that owns it.

The document that owns it is `docs/plans/local-reranker.md`, written at 2026-08-17 21:43:19 +0200,
and the product change is done there rather than here. It found one thing this ADR did not say: the
product reranked `resultsReturned` while every number in section 4 was measured at `rerankDepth`, so
shipping the scorer alone would have shipped a configuration nobody measured.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| The cross encoder proves unusable in the product for a reason the bench cannot see, such as memory on the target host | The decision reverts to no reranking, which is what the product effectively has today | minutes |
| A language model key and a current model appear, and reranking with them measures better on the same benches | This ADR is superseded in turn, by a document naming those numbers | hours |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether reranking becomes a per corpus setting the person can turn on, or a per vertical configuration decided once | The vertical experiment in `docs/plans/retrieval-quality.md` section 13 runs |
| Whether `src/reranker.js` and `groq-sdk` are removed | The open question about the language model paths in `docs/plans/retrieval-quality.md` section 12 is answered |
| Whether the model is pinned by checksum like the BEIR datasets are | A model update changes a number this project has published |
