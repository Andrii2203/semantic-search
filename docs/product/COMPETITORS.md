# Competitors

Status: active
Owner: repository owner
Last change: 2026-08-15 11:10:48 +0200
Supersedes: none

## 1. Problem

This project has argued about retrieval for three days and has never written down who else solves the
same problem for the same person. `docs/product/STRATEGY.md` describes where the product sits, and
nothing in the repository names a company whose product a user would choose instead.

Two decisions are blocked by that absence. Whether the engine is the asset, which
`docs/plans/retrieval-quality.md` section 13 already doubts, and where the axis work should stop,
because building toward a capability three products already ship for free is a way to lose slowly.

## 2. Decision

Not applicable. This document records external evidence about products, the way
`docs/reference/retrieval-in-industry.md` records external evidence about systems. It states no plan.

Proof of need: not applicable, per `docs/standards/DECISION_PROTOCOL.md` section 2, which does not
govern a written record of what already exists in the market.

## 3. Scope

In scope:
- Products a person could use instead of this one, grouped by which half of the product they replace.
- What each publishes about how it works, and nothing inferred beyond that.
- The read time and link for every claim.

Out of scope:
- Pricing comparisons beyond what a public page states, because no purchase decision is open.
- Feature checklists, because a checklist invites building the union of everyone's features, which is
  the opposite of what this document is for.

## 4. The direct shape: an intent, a set of feeds, a filtered inbox

This is the product in `CLAUDE.md` section 1, and it is not an empty category.

| Product | What it does | Read at |
|---|---|---|
| Feedly AI, formerly Leo | Machine learning models that gather, analyse and prioritise from "millions of sources" in real time, with pre trained models sold per vertical: threat intelligence, market intelligence, biopharma, risk. The vertical packaging this project treats as an open question is their shipped product | https://feedly.com/ai read 2026-08-15 11:09 +0200 |
| Feedly Leo, the earlier description | Priority filters trained on topics, companies and keywords, learning by example from saved boards, a mute filter and deduplication. Reported as analysing several million items per day | Secondary only. https://coywolf.com/news/content-marketing/feedly-leo-rss-news-feed-ai/ surfaced 2026-08-15 11:07 +0200, publisher's own engineering post not read directly |
| Particle | Synthesises several sources into one briefing per story and shows the different angles | Secondary only, from a 2026 comparison article surfaced 2026-08-15 11:07 +0200 |
| Ground News | The same feed problem approached through source bias rather than through personal intent | Secondary only, same read |
| Inoreader, Readwise Reader | Feed reading with filters and rules, without a learned profile | Secondary only, same read |

What this means for us, stated plainly. The idea of a personal AI filter over chosen feeds is a
product Feedly has shipped for years at a scale of millions of items per day, and its pre trained
vertical models are the same commercial shape `docs/plans/retrieval-quality.md` section 13 is
considering. Building toward parity on filtering is competing on their strongest axis.

The two things they publish nothing about, and where a difference could live: a profile that moves
from a person's own actions rather than from configured priorities, which is
`docs/adr/002-dynamic-profiles.md`, and a measured answer key per subject area, which is what this
project has actually built in `docs/plans/evaluation-corpus.md` and `docs/plans/public-benchmark.md`.

## 5. The other half: search the open web by meaning

| Product | What it publishes | Read at |
|---|---|---|
| Exa | A neural search API for agents. Claims 80 billion documents in its vector database, "the world's largest independent index", 1.4 trillion URLs tracked, sub 180 ms instant search, and highlight extraction that cuts tokens passed to a model by 90 percent | https://exa.ai/ read 2026-08-15 11:09 +0200 |
| Exa, commercial state | Reported at a 2.2 billion valuation after a May 2026 Series C, 400,000 developers, neural search at 7 dollars per 1000 requests | Secondary only, from a 2026 review surfaced 2026-08-15 11:08 +0200. Not confirmed at the company's own page |
| Perplexity | Answer engine over live web retrieval | Not read directly |
| Glean | Enterprise search over organisational data, already recorded in `docs/reference/retrieval-in-industry.md` row 3 | See that document |

What this means for us. Indexing the open web is not a competition this project can enter, and it
does not have to. The product's corpus is what a person chose to follow, which is a few hundred to a
few thousand items, and that is the size at which a full vector scan is affordable and an answer key
is affordable. Exa's index is the reason it is worth 2.2 billion and also the reason it cannot know
what one person cares about.

## 6. The uncomfortable conclusion

Neither the engine nor the feed reader is defensible on its own. Every part of the retrieval stack
this project is building is available as a package or an API, and the measurements in
`docs/eval/beir-axes-a-b.md` were produced with open collections and open models.

What is not available off the shelf is the thing this project accidentally built while trying to fix
search: a method for deciding whether a change helped, with a judge whose agreement is measured, a
frozen corpus, planted controls and a significance test. `docs/reference/retrieval-in-industry.md`
section 5.1 records that offline evaluation is the whole instrument here because there is no traffic
to A/B test with. Every competitor in section 4 has traffic and can settle an argument with a live
test, which means their evaluation apparatus is worth less to them than ours is to us.

That is an argument for the per vertical answer key being the asset, which is what
`docs/plans/retrieval-quality.md` section 13 predicted from BEIR's existence and what
`docs/eval/beir-axes-a-b.md` section 5.1 then measured on FiQA: the winning configuration is not the
same in every subject area.

## 7. Behaviours

Not applicable. This document records evidence about other products and changes no running behaviour.

## 8. Tests

Not applicable, for the reason in section 7.

## 9. Definition of done

- Every product named carries a link and the moment its page was read, or says in words that only a
  secondary source was read.
- No claim about a competitor's internals appears without a published source. Nothing here is
  inferred from using the product.

## 10. Rollback

Not applicable. A reference document carries no runtime risk.

## 11. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether Feedly's engineering blog states how the priority filter is trained, which would make it a row in `docs/reference/retrieval-in-industry.md` rather than a secondary line here | Someone reads it directly. It was not read for this document |
| Whether the vertical packaging in section 4 is priced per seat or per model, which decides whether the same shape is available to one person | A pricing page is read directly |
| Whether an index API such as Exa becomes a source in this product rather than a competitor | A user asks for content from outside the feeds they added |
