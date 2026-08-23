# The daily note

Status: active
Owner: repository owner
Last change: 2026-08-23 12:47:00 +0200
Supersedes: none

## 1. Problem

Phase 1 of `docs/plans/finance-vertical.md` asks for a daily note for one pair, produced from data
alone, so that there is something a person can read and reject before any expensive work starts.

Nothing produces it today. The parts exist in three places and none of them meet.
`calendar-archive` has held the schedule and the consensus twice a day since 2026-08-21. FRED has
the outcome of the American releases. The two have never been joined, so the line that matters,
what was expected against what arrived, has never been written for a single day.

Two limits were measured rather than assumed, and both change what this document can promise.

The calendar feed carries no outcome. Measured 2026-08-22 20:25 UTC on the live feed and again in the
archive: the six fields are `title`, `country`, `date`, `impact`, `forecast`, `previous`, all 100
events in the snapshot are dated before the fetch, and none carries an actual value. Recorded in
`calendar-archive/docs/calendar-archive.md` section 4.

The euro side has one stale source, not an absent one. This sentence replaces a wrong one, and the
wrong one is left described rather than deleted. It read that the euro side has no free source that
is current, and it was reached by checking Eurostat `prc_hicp_manr`, finding it stale, and spreading
that across the whole publisher.

Measured 2026-08-23, one dataset at a time:

| Dataset | Last updated | Latest period |
|---|---|---|
| `prc_hicp_manr`, `prc_hicp_midx`, inflation | 2026-02-06 | 2025-12 |
| `une_rt_m`, unemployment | 2026-08-21 | 2026-07 |
| `sts_inpr_m`, industrial production | 2026-08-22 | 2026-06 |
| `namq_10_gdp`, GDP | 2026-08-20 | 2026-Q2 |
| `sts_trtu_m`, retail trade | 2026-08-20 | 2026-06 |
| `ei_bsco_m`, consumer confidence | 2026-07-30 | 2026-07 |

Five of six are current. Inflation alone is stale, and the ECB data portal agrees with it: series
`ICP/M.U2.N.000000.4.ANR` also ends at 2025-12. FRED answered for every American series checked,
to 2026-07-01 monthly and 2026-08-15 for weekly claims.

## 2. Decision

One command reads the calendar archive for a chosen day, joins each American release to its FRED
series, and prints a note that names every scheduled release of that day, what was expected of it,
what arrived, and the difference. No language model, no network call to anything but FRED, and every
number carrying the source it came from and the moment it was read.

Behaviour 4 of `docs/plans/finance-vertical.md`, the movement of the pair around each release, is not
in this document. See section 3.

Proof of need: `docs/plans/finance-vertical.md` section 4, phase 1.

## 3. Scope

In scope:
- One pair, EUR/USD, and one day per run.
- The calendar archive as the only source of the schedule and the consensus.
- FRED as the only source of an outcome, through an explicit mapping table.
- A note printed as text, with a source and a read moment against every number.

Out of scope, each with its reason:
- The movement of the pair around a release, which is behaviour 4 of the phase. It needs intraday
  quotes, the only free source in reach is a MetaTrader 5 terminal on the owner's own broker account,
  and no MT5 terminal is installed. Measured 2026-08-22: the machine has FTMO MT4 only, whose stored
  history for EUR/USD is H4. The behaviour is built when MT5 exists, and nothing here is rewritten
  when it is.
- Euro area inflation, whose free sources stopped at 2025-12. Those releases appear with their
  schedule and their consensus, and their outcome marked with that reason.
- Euro area consumer confidence, because `ei_bsco_m` is current but the confidence indicator code
  in it did not resolve on 2026-08-23 and a guessed code is worse than an absent one.
- Any release whose title is not in the mapping table. Marked the same way, see behaviour 8.
- A delivery that reaches the owner anywhere but the archive repository. Behaviours 9 to 11 write
  the note into `calendar-archive/notes/`, where the schedule already lives and where machine
  commits already belong. Email, push and a screen in the Hub are all phase 2 or later, and the open
  question about which one the owner used is unchanged.
- A language model anywhere in the path, per behaviour 6.

## 4. Behaviours

The numbering follows `docs/plans/finance-vertical.md` section 5, so that a behaviour keeps one
number across both documents. Behaviour 4 is absent here by section 3.

1. The note names every scheduled release of its day, with the time that release was published.
2. A release carries its actual value, the consensus expected of it, and the difference between them.
3. A release with no consensus in the calendar appears in the note marked as such, rather than being
   dropped.
5. Every number in the note carries the source it was read from and the moment it was read.
6. The note is produced with no language model call.
7. A day with no scheduled release produces a note that says so, rather than an empty page.
8. A release whose title has no mapped series appears with its actual marked unavailable, naming
   whether the cause is the absent mapping or the absent source.
9. A note is written as a committed file named after the day it covers.
10. A day that rebuilds to the text it already holds leaves its file untouched.
11. A run that produced no note writes no file, and says which of the two reasons applies.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `backend/src/note/note-builder.spec.ts` |
| 2 | L1 | `backend/src/note/note-builder.spec.ts` |
| 3 | L1 | `backend/src/note/note-builder.spec.ts` |
| 5 | L1 | `backend/src/note/note-builder.spec.ts` |
| 6 | L1 | `backend/src/note/note-builder.spec.ts`, by reading the source the way `__tests__/reachability.test.js` does in the search repository |
| 7 | L1 | `backend/src/note/note-builder.spec.ts` |
| 8 | L1 | `backend/src/note/note-builder.spec.ts` |
| 9 | L1 | `calendar-archive/__tests__/scripts/write-note.test.js` |
| 10 | L1 | `calendar-archive/__tests__/scripts/write-note.test.js` |
| 11 | L1 | `calendar-archive/__tests__/scripts/write-note.test.js` |

The builder is a pure function of a calendar snapshot and a set of series observations, so every
behaviour is L1. The two readers that fetch those inputs are L4 boundaries and carry their own
tests, `backend/src/note/calendar-archive.spec.ts` and `backend/src/note/fred.spec.ts`. No test
reaches the network, per `docs/standards/TESTING_STANDARD.md` section 3.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run lint` and `npm test` are green in `backend`.
- One note exists for a real day, produced from the committed archive and a live FRED read, and it is
  pasted into this document under section 9.
- Anything left undone is written here with its trigger, per `CLAUDE.md` section 5.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| FRED changes the CSV endpoint | The reader is one module behind an interface, and the mapping table is data. Point it at the keyed API instead | one hour |
| The mapping table proves wrong for a release | The wrong row is one line of data and the note marks the release rather than inventing a number | minutes |
| The note turns out to be unreadable | That is the result phase 1 exists to produce. It is recorded and phase 2 measures it anyway | not applicable |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Answered 2026-08-23, in section 1. Nine euro area titles resolve through Eurostat. Inflation does not, and its trigger is a free source appearing or phase 6 pricing a paid one | partly closed |
| Which Eurostat code carries the consumer confidence indicator | The next week whose calendar carries that release |
| Whether the mapping table grows by hand or is generated | It passes roughly thirty rows and hand editing starts causing mistakes. At twenty two on 2026-08-23 |
| Whether the note is printed, stored or pushed | The owner reads a week of them and says which he actually used |
| Whether the reference period of a FRED observation is matched to the calendar event by rule or by hand | The first release where the two disagree |

## 8.2 Why the note is built by the archive repository and not by the Hub

The builder lives in the Hub, `backend/src/note/`, because the plan makes the Hub the trunk. The
schedule lives in `calendar-archive`, because `calendar-archive/docs/calendar-archive.md` section 7
already recorded the reason a machine that commits twice a day does not belong in a repository with
hand written history.

The two meet in `calendar-archive/.github/workflows/note.yml`, which checks out both. That workflow
needs one secret, `HUB_READ_TOKEN`, a personal access token with read access to the Hub repository,
because a workflow token reaches only its own repository. Until that secret exists the workflow fails
at checkout, loudly, which is the behaviour wanted: a silent skip would look like a quiet day.

The note modules import nothing but Node built-ins, checked 2026-08-23, so the workflow runs them
through `npx tsx` and installs no dependency tree at all.

## 8.1 A third reason a number is missing, added 2026-08-23

The note began with two reasons for an absent actual, no mapping and no source. A third was measured
and separated from them: some series are sold by whoever publishes them and no free source carries
them at all.

ISM Manufacturing and ISM Services were removed from FRED in 2016, and `fredgraph.csv?id=NAPM`
answered 404 on 2026-08-23. Every S&P Global PMI, flash and final, national and euro area, is the
same. Those two families are among the strongest movers of this pair, and no amount of mapping work
reaches them.

The note now says `the publisher sells this series and no free source carries it` rather than
blaming an absent mapping, because the two call for different work: one is a row to write, the other
is a purchase to consider in phase 6.

## 9. The first note

Produced 2026-08-23 10:39:11 +0200 from the committed archive and a live FRED read, for the release
of 2026-08-20:

    EUR/USD, 2026-08-20

    Calendar read 2026-08-21T17:45:08.107Z from https://nfs.faireconomy.media/ff_calendar_thisweek.json

      12:30 UTC  USD  Unemployment Claims  [Medium]
          expected 210K, arrived 206K, surprise -4K
          ICSA for 2026-08-15, read 2026-08-23T08:39:11.962Z from https://fred.stlouisfed.org/graph/fredgraph.csv?id=ICSA

That is the line the whole phase exists for, and every number on it can be checked by somebody else.

## 9.1 What the command produces today, and why it is thinner than the above

The note above was assembled by hand from the same modules, because the command refuses to build a
day it cannot honestly build. `latestSnapshotOnOrBefore` takes the newest snapshot fetched on or
before the day asked for, so that the consensus in the note is the one that stood before the release
rather than one revised afterwards. The archive begins 2026-08-21 and 2026-08-20 has no snapshot
before it.

The two days the archive does cover produce this:

    EUR/USD, 2026-08-21

    Calendar read 2026-08-21T17:45:08.107Z from https://nfs.faireconomy.media/ff_calendar_thisweek.json

      07:15 UTC  EUR  French Flash Manufacturing PMI  [Medium]
          expected 50.1, actual unavailable, no free euro area source current to the release day
      13:45 UTC  USD  Flash Manufacturing PMI  [Low]
          expected 53.9, actual unavailable, no series mapped for this title
      23:00 UTC  USD  President Trump Speaks  [Medium]
          no consensus published, actual unavailable, no series mapped for this title

    EUR/USD, 2026-08-22

    Calendar read 2026-08-22T05:39:24.466Z from https://nfs.faireconomy.media/ff_calendar_thisweek.json

    No scheduled release on 2026-08-22.

Ten events on the first day, none of them mapped, and a Saturday on the second. Every line is honest
and no line is useful yet, which is exactly what phase 1 was expected to produce.

The first day on which the command itself prints an arrival is the next Thursday carrying
Unemployment Claims, 2026-08-27, because that release is weekly and mapped. Nothing needs to be
written for that to happen. The archive collects twice a day on its own.
