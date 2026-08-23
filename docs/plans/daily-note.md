# The daily note

Status: active
Owner: repository owner
Last change: 2026-08-23 11:34:00 +0200
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

The euro side has no free source that is current. Measured 2026-08-23: Eurostat `prc_hicp_manr` for
the euro area was last updated 2026-02-06 and holds no 2026 observation, and the ECB data portal
series `ICP/M.U2.N.000000.4.ANR` ends at 2025-12. FRED, by contrast, answered for nine American
series with data to 2026-07-01, and to 2026-08-15 for weekly claims.

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
- An outcome for euro area releases, for the reason measured in section 1. Those releases appear in
  the note with their schedule and their consensus, and their outcome is marked unavailable with the
  reason named.
- Any release whose title is not in the mapping table. Marked the same way, see behaviour 8.
- Storage. The note is printed, not saved. Phase 2 decides what a report needs to read back.
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
| Whether the euro side gets an outcome at all, and from where | A free source current to the release day is found, or phase 6 prices a paid one |
| Whether the mapping table grows by hand or is generated | It passes roughly thirty rows and hand editing starts causing mistakes. At twenty two on 2026-08-23 |
| Whether the note is printed, stored or pushed | The owner reads a week of them and says which he actually used |
| Whether the reference period of a FRED observation is matched to the calendar event by rule or by hand | The first release where the two disagree |

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
