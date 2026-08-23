# The calendar report

Status: active
Owner: repository owner
Last change: 2026-08-23 22:03:29 +0200
Supersedes: none

## 1. Problem

Behaviour 8 of `docs/plans/finance-vertical.md` asks for a report that lists every event of a period
and says whether the note carried it. It is the first of the two numbers phase 2 exists to produce,
and it is the only one no document owns.

The code for it exists and nothing points at it. `backend/src/note/calendar-report.ts` was written
2026-08-23 11:39 +0200 with five passing specs, and `grep -rn buildCalendarReport backend/src`
outside the spec returns exactly one line, its own declaration. There is no command that runs it,
unlike the note and the price report, which have `build-note.ts` and `build-price-report.ts` and npm
scripts of their own.

So phase 2 reads as half delivered in `docs/plans/price-report.md` section 1, which says the calendar
report says how much of the schedule the note carried. It cannot say anything, because nobody can
run it.

The second half of the problem is what the report should compare against, and it was never written
down. Measuring the note against the same snapshot it was built from answers nothing: the note names
every release of that snapshot by behaviour 1 of `docs/plans/daily-note.md`, so recall is 100 percent
by construction.

## 2. Decision

The truth for a day is the latest snapshot that still carries that day. The note is measured on the
snapshot that stood before the day, which is what the note was built from. An event that entered the
calendar after that snapshot is a miss, and that is the only way this report can find anything.

The truth is per day rather than one snapshot for the whole period, and the reason was measured
rather than assumed. The free feed publishes one week at a time, so the snapshot taken on
2026-08-23 17:34:12 +0000 carries the week that starts on the 24th and no longer carries the 21st.
A single latest snapshot as the truth therefore reported `No scheduled event in the window` for a
window that had ten of them.

A command prints the report for a window given on the command line, so the number can be produced by
somebody other than its author.

Proof of need: `docs/plans/finance-vertical.md` section 5, behaviour 8. The code with no caller is a
defect, and `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes from the proof of
need.

## 3. Scope

In scope:
- The comparison of section 2, over one window, for the countries the note covers.
- Days without a snapshot, excluded and named, following the rule
  `docs/plans/price-report.md` behaviour 8 already set for the price side.
- One command, `npm run report:calendar`, beside the two that already exist.

Out of scope, each with its reason:
- Whether the note's numbers are right. That is the price report and the noise count, which
  `docs/plans/price-report.md` owns.
- Any judgement about the recall figure. One week of archive cannot carry one, and section 8 records
  what would.
- Rebuilding the notes as files. The report reads the archive and computes what a note for that day
  would carry, so it does not depend on a note having been committed.

## 4. Behaviours

The numbering follows `docs/plans/finance-vertical.md` behaviour 8, which this document owns in full.

1. The report lists every event of the period and whether the note carried it.
2. The report counts recall as the share of scheduled events the notes carried.
3. The report names the window it used and the moment that window was fixed.
4. The report refuses to run when the window was changed after it was fixed.
5. A period with no scheduled event reports that, rather than reporting perfect recall.
6. A day with no snapshot on or before it is excluded from the count and named in the report.
7. An event that entered the calendar after the day's own snapshot counts as missed.
8. An event present in the day's own snapshot counts as carried.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `backend/src/note/calendar-report.spec.ts` |
| 2 | L1 | `backend/src/note/calendar-report.spec.ts` |
| 3 | L1 | `backend/src/note/calendar-report.spec.ts` |
| 4 | L1 | `backend/src/note/calendar-report.spec.ts` |
| 5 | L1 | `backend/src/note/calendar-report.spec.ts` |
| 6 | L1 | `backend/src/note/calendar-report.spec.ts` |
| 7 | L1 | `backend/src/note/calendar-recall.spec.ts` |
| 8 | L1 | `backend/src/note/calendar-recall.spec.ts` |

Behaviours 7 and 8 belong to the function that turns snapshots into the report's input, which is pure
and takes the snapshots as data, so no test reads the archive from disk.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run lint` and `npm test` are green in `backend`.
- The command runs over the committed archive and its output is pasted into section 9, whatever it
  says.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The comparison proves wrong, because the free feed revises events rather than adding them | The two snapshots are named in the report header. Change which snapshot is the truth, rerun, and the old runs stay valid under the old rule | one hour |
| The report reads a snapshot the archive later corrects | Snapshots are never overwritten, per `calendar-archive/docs/calendar-archive.md` section 2, so a rerun of the same window gives the same answer | not applicable |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| How long the archive must be before a recall figure means anything | Two windows of the same length disagree by more than the run to run variation, which is zero here because the input is committed |
| Whether an event whose time moved counts as carried | The first event in the archive whose time changed between two snapshots |
| Whether recall is reported per country as well as overall | The first window where one of the two countries carries most of the misses |

## 9. The first report

Run 2026-08-23 22:12 +0200 over the committed archive, which holds three days.

    Calendar recall, 2026-08-20 to 2026-08-23
    Window fixed 2026-08-23T17:34:12.125Z, countries USD, EUR
      2026-08-20 excluded, no calendar snapshot on or before it

      2026-08-21
        EUR  French Flash Manufacturing PMI  carried
        EUR  French Flash Services PMI  carried
        EUR  German Flash Manufacturing PMI  carried
        EUR  German Flash Services PMI  carried
        EUR  Flash Manufacturing PMI  carried
        EUR  Flash Services PMI  carried
        USD  Flash Manufacturing PMI  carried
        USD  Flash Services PMI  carried
        EUR  Consumer Confidence  carried
        USD  President Trump Speaks  carried
      2026-08-22
      2026-08-23

      carried 10 of 10, recall 100%

Ten events, all carried, one day excluded and two empty days that are a Saturday and a Sunday.

The figure is not a result and it is not read as one. One weekday of archive cannot miss anything:
the only way to miss an event is for it to enter the calendar between the snapshot the note used and
the day itself, and with two snapshots a day and a week of forward schedule that needs a longer
archive to happen at all. What the run does establish is that the command exists, that the comparison
of section 2 works on real files, and that a day with no snapshot is named rather than counted, which
is the same rule the price side already follows.
