# The finance vertical

Status: draft
Owner: repository owner
Last change: 2026-08-21 15:20:00 +0200
Supersedes: none

## 1. Problem

There are two working systems and no result.

This repository holds a retrieval engine whose every number is measured: three public collections,
six axes, a break a line check on every behaviour. It has no product around it. The database is
empty, the account count is zero, and nothing it does can be shown to a person as an answer to a
question they asked.

`News-Intelligence-Hub-main` holds the opposite. It is a product: queues, workers, multi user
isolation, entity extraction with deduplication, a graph, digests, cost telemetry, and a live boot
confirmed by an outside reviewer who placed it seventh of thirty four. Its search is a SQL substring
match over title and summary, its idea of a similar article is an overlap of extracted entities
computed in memory on every request, and none of that has ever been measured.

The owner's question is narrower than either system: a daily picture of what changed for one
currency pair and why, at the moment it changes, reliable enough to replace what an analyst hands
over.

Neither system answers it, and the reason is not that they are unfinished. It is that the work so
far has been ordered by the architecture rather than by the result. Search and a graph are the
second half of the answer. The first half is data that neither system ingests: the release, what was
expected of it, and what the price did.

## 2. Decision

One product, the Hub, with the measured retrieval core inside it rather than beside it, and an
analytical layer that follows the published methods recorded in
`docs/reference/analysis-in-industry.md`.

The first thing built is the thinnest slice that produces a daily note for one pair out of data
alone, before any retrieval work, so that there is something to criticise and something to measure.
Every phase after that has to beat the note that already exists.

Proof of need: `docs/standards/DECISION_PROTOCOL.md` question 1 asks for a trigger that already
happened. Two have. The corpus of the three retired sources was deleted on 2026-08-20 and the
product now has no material at all, so a source decision cannot be deferred. And the reviewer of the
Hub named its similarity computation as its main weakness, recommending embeddings and an
incremental index, which is the work this plan schedules as phase 3.

## 3. Scope

In scope:
- The Hub as the single product, audited against the six recommendations of its review.
- A daily note for one pair, produced without a language model, from calendar, consensus, release
  and price.
- Two measurements of that note: how much of what mattered it carried, and how much of what it
  carried mattered.
- The retrieval core of this repository moved into the Hub as a library, with vectors in Postgres.
- Finance sources with a full body, replacing summary feeds.
- The text layer: stance, novelty and the explanation of a move.
- One historical run over several years, measured rather than tuned against.

Out of scope, each with its reason:
- Trading signals and anything that implies a position. `docs/reference/analysis-in-industry.md`
  section 3 keeps them out, and they carry a standard of proof this project has not built.
- More than one currency pair, and more than one vertical, until the first one has a measured note.
- Rewriting the retrieval core in TypeScript. The numbers this project publishes describe the code
  as it is, and a rewrite discards them.
- Ukrainian. `docs/plans/retrieval-quality.md` section 5 keeps it out of the measurement and holds
  it as a single check against the winner.
- Phases 7 and 8 of `docs/plans/retrieval-quality.md`, paused rather than cancelled. See section 8.

## 4. Order of work

The order is chosen so that the first result arrives before the expensive work, and so that every
later phase is measured against a note that already exists.

The collector that feeds phase 1 is already running, and it lives outside this repository. It is at
https://github.com/Andrii2203/calendar-archive, private, and it stores the free economic calendar
twice a day through GitHub Actions rather than through any machine of the owner. Its own document
travelled with it. The reason it is separate is recorded there: an archive has to outlive the code
that reads it, and that code is about to move into the Hub.

| # | Phase | What it produces | Why here |
|---|---|---|---|
| 0 | Hub audit | A list of what boots, what is broken and what is missing against the six recommendations of the review | Nothing can be built on it until its state is known rather than assumed |
| 1 | The thin slice | A daily note for one pair from calendar, consensus, release and price, with no language model in it | It is the first thing a person can read and reject. It needs no retrieval and no graph |
| 2 | The two numbers | Recall against the macro calendar, recall against price events, and the noise count | Without them the note is an opinion, and every later phase has nothing to beat |
| 3 | The retrieval core inside the Hub | Chunks and vectors in Postgres, hybrid search and reranking replacing the substring match and the entity overlap | The reviewer named this as the main weakness, and the historical run is impossible without it |
| 4 | Sources with a body | Central bank archives, macro releases, and news with full text rather than feed summaries | Every layer above is limited by what the ingest stores |
| 5 | The text layer | Stance per statement, novelty against what is already known, and the explanation attached to a move | This is where retrieval and the graph finally earn their place |
| 6 | The historical run | The two numbers of phase 2, over several years, on a period never used for tuning | The only honest answer to whether this replaces an analyst |

Phase 1 deliberately produces a worse product than the one that already exists, because it produces
a measurable one. The Hub can already show a prettier screen than a plain daily note. It cannot say
how much it missed.

## 5. Behaviours

Phases 0 to 2 only. Later phases carry their own document and their own behaviour list, per the rule
`docs/eval/beir-axes-a-b.md` section 12 set and this project has followed since.

1. The note names every scheduled release in its window, with the time it was published.
2. A release carries its actual value, the consensus expected of it, and the difference between
   them.
3. A release with no consensus available appears in the note marked as such, rather than being
   dropped.
4. The note names the movement of the pair in a fixed window around each release.
5. Every number in the note carries the source it was read from and the moment it was read.
6. The note is produced with no language model call.
7. A day with no scheduled release produces a note that says so, rather than an empty page.
8. The calendar report lists every event of the period and whether the note carried it.
9. The price report lists every abnormal move of the period, by the definition fixed before the run,
   and whether the note carried an explanation published before it.
10. The noise report counts the entries the note carried that preceded no abnormal move.
11. Both reports name the windows they used and refuse to run if a window was changed after the
    period was chosen.

## 6. Tests

| # | Level | File |
|---|---|---|
| 1 | L2 | the Hub, in the module that builds the note |
| 2 | L2 | same |
| 3 | L2 | same |
| 4 | L2 | same |
| 5 | L1 | same |
| 6 | L1 | same, by reading the source the way `__tests__/reachability.test.js` does here |
| 7 | L2 | same |
| 8 | L2 | the module that produces the reports |
| 9 | L2 | same |
| 10 | L2 | same |
| 11 | L1 | same |

The file column is deliberately not a path. The Hub does not yet follow the naming rule of
`docs/standards/TESTING_STANDARD.md` section 5, and phase 0 decides whether it adopts it or keeps
its own. The paths are written when that is decided, and this table is not merged until they are.

## 7. Definition of done

- Every behaviour in section 5 has a passing test.
- The daily note exists for a period of at least one month, and the owner has read it and said
  whether it is worth reading.
- The two numbers of phase 2 exist for that period, with the windows named.
- The gate of whichever repository owns the code is green, and it is the gate named in `CLAUDE.md`
  section 4 step 5 for this one.
- Anything deliberately left undone is written here with its trigger, per `CLAUDE.md` section 5.

## 8. What is paused, and what would restart it

| Work | State | Trigger that restarts it |
|---|---|---|
| Phase 7 of `docs/plans/retrieval-quality.md`, query time chunking | Paused. It improves the engine and answers none of the questions in section 1 | The finance vertical has a measured note and the engine becomes the limit |
| Phase 8 of the same plan, the locked half and the Ukrainian holdout | Paused, and deliberately unspent. It is one shot, and spending it on a configuration that is about to gain a graph and a finance corpus wastes it | The configuration is final |
| The three other verticals | Not started, and not scheduled. One vertical answers the question that three would answer three times | The first vertical produces a note somebody outside this project wants |

## 9. Rollback

| If | Action | Time |
|---|---|---|
| The Hub turns out to be too far from the standards of this repository to build on | The thin slice of phase 1 has no dependency on it. It moves here, and the Hub stays a product shell | days rather than weeks |
| Consensus forecasts prove unavailable | The note loses the surprise line and keeps the release, the stance and the price reaction. The two numbers of phase 2 still work, on a weaker note | immediate, recorded as a limitation |
| The historical news archive cannot be assembled under a licence we can accept | The historical run narrows to central bank statements and macro releases, which are public, and the news half is reported as not measured | one phase |
| The measured note misses so much that it cannot replace an analyst | That is a result, not a failure, and it is the one the owner asked for. It is recorded and the product is repositioned as an aid rather than a replacement | not applicable |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Where `News-Intelligence-Hub-main` lives, and whether it keeps its own git history | Before the first commit that touches it |
| Which repository owns these documents once the Hub is the trunk | Phase 3, when the code of both meets |
| Whether the Hub adopts the standards of this repository, in full or in part | Phase 0 |
| Which pair, and which period, the historical run uses | Phase 6, and the period is chosen before any tuning |
| Whether the note is pushed or waited for | The owner reads the first month of notes and says which one he actually used |
