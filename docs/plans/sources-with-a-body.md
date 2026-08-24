# Sources with a body

Status: active
Owner: repository owner
Last change: 2026-08-24 13:18:40 +0200
Supersedes: none

## 1. Problem

Phase 4 of `docs/plans/finance-vertical.md` asks for central bank archives, macro releases and news
with full text rather than feed summaries. Nothing in the Hub can store any of them today, and the
reason is one line of the ingest.

`backend/src/workers/feed-pull.worker.ts:95` takes the body of an item as
`item.content || item.description || ''` and never opens the link. What the seven candidate feeds of
this vertical carry there was measured 2026-08-24 11:13:46 +0200 and is recorded in
`docs/adr/024-the-body-is-fetched-from-the-page.md` section 1. The two numbers that decide this phase:
the ECB press feed carries zero characters on all 15 of its items, and the BBC business feed carries
a median of 102 characters over its 51.

`backend/src/pipeline/prefilter.service.ts:27` drops anything under 200 characters, so both sources
are discarded before the language model, before the chunker and before the search of phase 3 ever
sees them. That already happened in the containers: 38 BBC articles arrived on 2026-08-23 and all 38
were `pre_filtered`, recorded in `docs/plans/retrieval-in-the-hub.md` section 9.1.

The consequence is not a thin corpus, it is an empty one. The pair this vertical is about is moved by
the ECB and the Fed, and neither can enter the product at all.

This document also reverses a decision of this repository rather than pretending it never happened.
`docs/plans/retrieval-quality.md` section 12 closed the question of fetching the linked body on
2026-08-16 11:07:48 +0200, with the sentence that RSS carries bodies without a scraper. That was true
of the source it was measured on, an Ars Technica feed of 20 items with real bodies, and it is false
of every central bank feed in the table above. The old decision is not wrong about its evidence, it
is wrong about its reach.

## 2. Decision

An article whose feed text is below the prefilter threshold has its page fetched once, its body
extracted by Readability over a jsdom document, and the result stored beside the feed text. The
prefilter, the analysis and the chunker read the body when there is one. Nothing overwrites what the
feed said.

Proof of need: `docs/adr/024-the-body-is-fetched-from-the-page.md`.

## 3. Scope

In scope:
- A body column on the article, with the origin of the body, the moment the page was read and the
  reason when no body was stored.
- A fetch and extract step in the article processing worker, ahead of the prefilter.
- The prefilter and the chunker reading the body when there is one.
- A backfill command for the articles already stored, beside `retrieval:backfill`.
- The write of the whole feed XML into every article row, which is a defect found while reading this
  path. See section 3.2.

Out of scope, each with its reason:
- Rendering JavaScript. None of the four sources of this vertical needs it, measured in ADR-024
  section 4, and a browser in the ingest is a different phase and a different cost.
- Reading `robots.txt`. It is an open question with a trigger in ADR-024 section 10, and the four
  sources here are public archives that publish for citation.
- Re-fetching a page after it changes. A body is read once, per ADR-024 section 6.
- Measuring whether the extracted body is better than the feed text for retrieval. There is no answer
  key for the corpus of the Hub, per `docs/adr/022-the-retrieval-core-moves-into-the-hub-as-javascript.md`
  section 6, and inventing one here would hide what this phase actually did.
- The historical archive of news, which is phase 6 and carries a licence question this phase does not
  touch.
- Upgrading the 25 dependencies a major behind. See section 3.1.

## 3.1 Dependencies, read before the phase

Required by `docs/standards/DEPENDENCY_STANDARD.md` rule 1. Read from the registry at
2026-08-24 11:17:36 +0200, and from `npm outdated` in `backend` at 2026-08-24 11:18:57 +0200.

Added by this phase:

| Package | Version | Licence | Node engines | Direct dependencies | Why this one |
|---|---|---|---|---|---|
| `@mozilla/readability` | 0.6.0, published 2025-03-03 | Apache-2.0 | `>=14.0.0` | 0 | ADR-024 section 4, measured against a hand written extractor on seven pages |
| `jsdom` | 26.1.0 installed, latest 30.0.1 | MIT | `>=18` | 20 | ADR-024 section 5. linkedom and jsdom 27 were chosen first and neither loads under the CommonJS suite of this backend. Extraction measured identical across all four implementations |

Readability at 0.6.0 is 17 months old at the moment of the read. It is not behind, it is the latest
published version, and the row is here so that a later reader does not have to check.

jsdom is one major behind, which rule 2 of the standard calls a defect. Its reason and its trigger are
in ADR-024 section 5: the newer majors fail to load in CommonJS or demand Node 22, and the trigger is
this backend leaving CommonJS or its images moving to Node 22 or newer.

The state of everything else: `npm outdated` lists 31 packages, of which 25 are at least one major
version behind, including `@nestjs/*` at 10 against 11, `prisma` at 5 against 7, `express` at 4
against 5, `eslint` at 8 against 10 and `typescript` at 5 against 7. Under rule 2 of the standard that
is a defect with a named trigger, and the trigger is written here rather than left blank: it is its
own phase, it touches every file of the Hub, and doing it inside a phase that adds two packages would
make it impossible to say which change broke what. It is forced by the first of those upgrades being
needed to install something this vertical requires, or by phase 5 starting, whichever comes first.

Neither package added here is affected by that backlog. Both are leaves.

## 3.2 What was found while reading the ingest

`backend/src/workers/feed-pull.worker.ts:129` writes `rawContent: xml`, the entire feed document, into
every article row it creates. Nothing reads that column: `grep -rn rawContent backend/src` returns
this write and one unrelated parameter name in `prefilter.service.ts:60`.

The cost was measured 2026-08-24 11:21:51 +0200. The BBC business feed is 37741 bytes and carries 51
items, so one pull of it stores 1.9 MB, of which 37 KB is information. The ECB press feed is 5960
bytes over 15 items, 89 KB stored.

It is in scope because this phase is the one that reads that path, and because a body column is about
to be added next to a column that holds fifty copies of the same XML.

## 4. Behaviours

1. An article whose feed text is shorter than the fetch threshold has its page fetched.
2. An article whose feed text is at or above the fetch threshold has no page fetched.
3. The extracted body is stored when it is longer than the feed text.
4. The feed text is kept when the extracted body is not longer than it, and the reason is recorded.
5. A stored body carries the extractor that produced it and the moment the page was read.
6. A page answering with a status other than 200 leaves the feed text and records that status.
7. A page that exceeds the fetch timeout leaves the feed text and records the timeout.
8. An extraction that returns nothing, or less than the fetch threshold, leaves the feed text and
   records that reason.
9. An article whose page has already been read is not read a second time.
10. A body longer than the cap is stored cut at the cap and says it was cut.
11. A response larger than the byte ceiling is not parsed, and the reason is recorded.
12. The prefilter reads the stored body when there is one, and the feed text when there is not.
13. An article with a stored body is chunked from that body.
14. The fetcher holds at most one request at a time against one host.
15. The fetcher identifies itself with the same user agent the feed pull sends.
16. A feed marked as not fetchable produces no page request.
17. An article stores no copy of the feed document it arrived in.
18. A page that cannot be reached at all leaves the feed text and records that reason, distinct from
    the timeout of behaviour 7.
19. Two items of one feed that carry no text are stored as two articles.

## 4.1 The four numbers this phase adds, and where each comes from

| Name | Value | Origin |
|---|---|---|
| Fetch threshold | `PREFILTER_MIN_LENGTH`, 200 today | Not a new number. The page is fetched exactly when the prefilter would otherwise drop the item, so the two cannot disagree |
| Body cap | 100000 characters | Borrowed with its origin from `articleBodyChars` in `semantic-search/src/search-constants.js`, whose row in `docs/reference/search-constants.md` records it as above the longest article ever seen there, 66890 |
| Byte ceiling | 2000000 bytes | The largest page measured for ADR-024 is 408999 bytes, so this is roughly five times the largest seen. It is a guard against a download, not a judgement about content |
| Fetch timeout | 15000 milliseconds | The two pages timed at 2026-08-24 11:18:26 +0200 took 296 and 193 milliseconds. This is fifty times the slower of them. The feed pull already uses 30000 for a feed, and a single page is given less |

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `backend/src/ingest/body-decision.spec.ts` |
| 2 | L1 | `backend/src/ingest/body-decision.spec.ts` |
| 3 | L1 | `backend/src/ingest/body-decision.spec.ts` |
| 4 | L1 | `backend/src/ingest/body-decision.spec.ts` |
| 5 | L2 | `backend/tests/body.integration.spec.ts` |
| 6 | L1 | `backend/src/ingest/body-fetcher.spec.ts` and `backend/src/ingest/body-decision.spec.ts` |
| 7 | L1 | `backend/src/ingest/body-fetcher.spec.ts` and `backend/src/ingest/body-decision.spec.ts` |
| 8 | L1 | `backend/src/ingest/body-extractor.spec.ts` and `backend/src/ingest/body-decision.spec.ts` |
| 9 | L2 | `backend/tests/body.integration.spec.ts` |
| 10 | L1 | `backend/src/ingest/body-extractor.spec.ts` |
| 11 | L1 | `backend/src/ingest/body-fetcher.spec.ts` and `backend/src/ingest/body-decision.spec.ts` |
| 12 | L2 | `backend/tests/body.integration.spec.ts` |
| 13 | L2 | `backend/tests/body.integration.spec.ts` |
| 14 | L1 | `backend/src/ingest/body-fetcher.spec.ts` |
| 15 | L1 | `backend/src/ingest/body-fetcher.spec.ts` |
| 16 | L2 | `backend/tests/body.integration.spec.ts` |
| 17 | L2 | `backend/tests/feed-pull.integration.spec.ts` |
| 18 | L1 | `backend/src/ingest/body-fetcher.spec.ts` and `backend/src/ingest/body-decision.spec.ts` |
| 19 | L2 | `backend/tests/feed-pull.integration.spec.ts` |

The extractor is a pure function of HTML, and the decision of what to store is a pure function of two
lengths and a fetch outcome, so both are L1. The fetcher takes its `fetch` as an injected function,
the way the encoder is injected in `docs/plans/retrieval-in-the-hub.md` section 5, so no test reaches
the network, per `docs/standards/TESTING_STANDARD.md` section 3. That the real pages extract at all is
the live check of section 9, not a test.

The integration specs run against the test database of `docs/plans/hub-test-database.md`, never the
product database.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run lint` and `npm test` are green in `backend`, and `npm run test:e2e` is green against the
  test database.
- A live check in section 9, on a real account, in which an ECB press release is stored with a body,
  chunked and returned by the search endpoint of phase 3. That is the end to end proof, because it is
  the item that could not exist at all before this phase.
- The `body fetched` log line of ADR-024 question 5 appears with its counts.
- Anything left undone is written here with its trigger, per `CLAUDE.md` section 5.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| Extraction returns chrome for a source | The body column is beside the feed text, not over it. Null the column for that feed and the ingest is what it is today | minutes |
| The fetch step slows ingest | It is one guarded call in the article processing worker. Remove the call, keep the column and the backfill | minutes |
| A publisher answers 403 or asks us to stop | Behaviour 16 switches that feed off in one row | minutes |
| The two new packages cannot install in `node:20-slim` | `linkedom` requires Node `>=16` and Readability `>=14`, so this is not expected. If it happens, the extractor interface has one implementation behind it and jsdom 27.4.0 accepts `^20.19.0` | one hour |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the ECB, Fed, BLS and BEA feeds become a starting base for a finance account, the way `docs/adr/015-a-vertical-ships-a-starting-base.md` describes | The live check of section 9 passes and a second account wants the same feeds |
| Whether the euro area releases the note cannot price, recorded in `docs/plans/daily-note.md` section 8.1, gain a body through this path even though they gain no number | The first note where a missing actual has an ECB page explaining it |
| Whether a body replaces the summary the language model writes, or sits beside it | The first article where the analysis and the body disagree |
| Whether extraction is measured rather than eyeballed | Unchanged from ADR-024 section 10, phase 5 |
| Whether the body cap and `PREFILTER_MAX_LENGTH` are reconciled, since a capped body is then dropped as too long. Seen twice on 2026-08-24, section 9.1 | A source this vertical needs is lost to it, rather than two speeches |
| Whether an article whose page timed out is ever read again, given that behaviour 9 forbids a second read | The first release that matters is lost to a timeout |

## 9. The live check

Run 2026-08-24 between 12:50:41 and 13:10 +0200, in the containers, on the account
`retrieval-live@local` that `docs/plans/retrieval-in-the-hub.md` section 9 left behind. The ECB press
feed was added and pulled, which is the feed that carries zero characters of body on every item.

    ECB articles: 15
      feed    0 body   9097  stored  Piero Cipollone: Interview with ilsussidiario.net
      feed    0 body   5870  stored  ECB Consumer Expectations Survey results, July 2026
      feed    0 body   7635  stored  Christine Lagarde: Panel remarks about the European economy
      feed    0 body 100000  stored  Philip R. Lane: The rise in defence spending
      feed    0 body   1851  stored  Cash remains most widely accepted payment method
      feed    0 body   2339  stored  ECB and Frankfurt Radio Symphony invite the public
      feed    0 body   4758  stored  ECB publishes consolidated banking data for end-March
      feed    0 body   3668  stored  Digital euro app to incorporate highest accessibility
      feed    0 body  10843  stored  ECB wage tracker at 2.7% in Q1 2027
      feed    0 body 100000  stored  Philip R. Lane: Outlook for the euro area economy
      feed    0 body  13164  stored  Decisions taken by the Governing Council of the ECB
      feed    0 body      0  timeout ECB to extend use of climate factors in Eurosystem
      feed    0 body   4969  stored  Results of the June 2026 survey on credit terms
      feed    0 body   1982  stored  ECB to start implementing enhanced repo facility
      feed    0 body   3840  stored  Results of the ECB Survey of Professional Forecasters

Fourteen of fifteen carry a body where the feed carried nothing. One timed out and kept the feed
text, which is behaviour 7 seen in the wild rather than in a test. Two hit the cap and are marked
truncated, which is behaviour 10.

The log line of ADR-024 question 5, from the worker container:

    {"articleId":"...","bodyChars":9097,"feedChars":0,"host":"www.ecb.europa.eu","htmlBytes":112668,
     "message":"body fetched","ms":424,"status":"stored"}
    {"articleId":"...","bodyChars":2502,"feedChars":85,"host":"www.bbc.co.uk","htmlBytes":423962,
     "message":"body fetched","ms":485,"status":"stored"}

The end to end proof, a search over the same account for
`what did the central bank decide about interest rates`, answered by the real model on the host:

    0.0322  Decisions taken by the Governing Council of the ECB
    0.0310  Piero Cipollone: Interview with ilsussidiario.net
    0.0306  ECB to start implementing enhanced repo facility for central banks
    0.0285  ECB Consumer Expectations Survey results, July 2026
    0.0268  Results of the June 2026 survey on credit terms and conditions

Every one of those was unstorable in this product yesterday. Nothing here says the ranking is good,
for the reason ADR-022 section 6 already gave: this corpus has no answer key.

## 9.1 What the live check found that no test would have

Two things, and the first is a defect that this phase created the conditions to see.

The first pull of the ECB feed stored one article out of fifteen. `contentHash` was
`sha256(content)`, and the content of every item of that feed is the empty string, so all fifteen
hashed to `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` and fourteen were treated
as duplicates of the first. Reproduced as a test, then fixed: the hash is now over the normalised URL
and the content together, which is behaviour 19. It is a defect of the ingest that predates this
phase and could only ever fire on a feed with no body, which is precisely the feed this phase exists
to admit.

The second is an interaction rather than a defect. `PREFILTER_MAX_LENGTH` is 50000 and the body cap
is 100000, so the two speeches that hit the cap were then dropped by the prefilter as `too_long`.
Three of the fifteen ECB processings are `pre_filtered`: those two and the one that timed out. The
numbers are left as they are and the question is recorded in section 8, because changing a threshold
to make a result look better is what `docs/plans/price-report.md` section 9.1 refused to do.

Eleven of the fifteen reached `error` on the analysis, because the language model key is still the
placeholder, exactly as `docs/plans/hub-audit.md` section 4 and
`docs/plans/retrieval-in-the-hub.md` section 9 recorded. They were chunked and embedded anyway, which
is behaviour 15 of that document, and 72 chunks of ECB text now exist.
