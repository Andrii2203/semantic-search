# The price report and the noise count

Status: active
Owner: repository owner
Last change: 2026-08-23 19:41:00 +0200
Supersedes: none

## 1. Problem

`docs/plans/finance-vertical.md` phase 2 asks for two numbers, and `docs/plans/daily-note.md`
delivered only the first. The calendar report says how much of the schedule the note carried. Nothing
says whether the note carried what mattered, or how much of what it carried mattered.

Without those two, the note is an opinion. It lists releases, it prints a movement, and no line of it
is answerable to the question the owner actually asked: does this replace what an analyst hands over.

The definition of an abnormal move is the part that decides whether the answer means anything, and it
is the part most easily bent. A threshold chosen after seeing the results can be moved until the note
looks good. This document fixes it before a single number has been computed, which is section 3.1,
and behaviour 5 refuses to run if it changes afterwards.

## 2. Decision

Two reports over a chosen period. The price report lists every abnormal move and says whether the
note carried an explanation published before it. The noise report counts the entries the note carried
that preceded no abnormal move.

Proof of need: `docs/plans/finance-vertical.md` section 5, behaviours 9 and 10.

## 3. Scope

In scope:
- One pair, EUR/USD, over a period of whole days for which quotes were exported.
- The definition in section 3.1, fixed before any run.
- The two reports, printed, with every window named.

Out of scope, each with its reason:
- A verdict on whether the note is good enough. That is the owner reading it, per
  `docs/plans/finance-vertical.md` section 7, and no number replaces it.
- Any tuning of the threshold to improve a result. Section 3.1 is fixed, and changing it invalidates
  every number taken under the old one.
- Explanations from anything but the calendar. News text is phase 5.

## 3.1 What counts as an abnormal move, fixed 2026-08-23 19:18:53 +0200

Written before any report was run, and recorded here so that a later disagreement with the numbers
cannot be settled by moving this paragraph.

The day is cut into windows of thirty minutes, starting at every half hour, not overlapping. Thirty
minutes because that is the window the note already uses for a release, and two different windows in
one product would make the two halves incomparable.

The move of a window is the close of its last minute minus the close of the minute before it began,
in pips.

The baseline is the median of the absolute moves of every window in the period. The median rather
than the mean, because a handful of violent windows would drag a mean upwards and hide themselves
behind it.

A window is abnormal when its absolute move is at least three times the baseline. Three because it is
the convention this project already follows elsewhere for an outlier and because any number chosen
here is arbitrary; what matters is that it was chosen before the data was seen and is reported with
the baseline in pips beside it, so anybody can recompute at another multiple.

A release explains an abnormal move when the release was published at or before the minute the window
begins, and the window begins no later than thirty minutes after the release. A release published
inside the move explains nothing, which is the leakage rule of
`docs/plans/finance-vertical.md` behaviour 9.

## 4. Behaviours

1. The price report lists every abnormal move of the period, with its moment and its size.
2. An abnormal move carries the release that explains it, or says that none does.
3. A release published after a move began does not explain that move.
4. The noise report counts the releases the note carried that preceded no abnormal move.
5. Both reports refuse to run when the window or the multiple differs from the one declared before
   the period was chosen.
6. Both reports name the period, the window, the multiple and the baseline in pips they used.
7. A period with no abnormal move reports that, rather than reporting perfect recall.
8. A day with no calendar snapshot is excluded and named, rather than counted as a day the note
   missed.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `backend/src/note/price-report.spec.ts` |
| 2 | L1 | `backend/src/note/price-report.spec.ts` |
| 3 | L1 | `backend/src/note/price-report.spec.ts` |
| 4 | L1 | `backend/src/note/price-report.spec.ts` |
| 5 | L1 | `backend/src/note/price-report.spec.ts` |
| 6 | L1 | `backend/src/note/price-report.spec.ts` |
| 7 | L1 | `backend/src/note/price-report.spec.ts` |
| 8 | L1 | `backend/src/note/price-report.spec.ts` |

Every behaviour is a pure function of bars and releases, so every test is L1. The readers that supply
both are already covered by `calendar-archive.spec.ts` and by the exporter's own boundary.

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run lint` and `npm test` are green in `backend`.
- One report exists over a real period, pasted into section 9 whatever it says.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The threshold turns out to be far too loose or too tight | It is recorded with the baseline in pips, so any number can be recomputed at another multiple. The old runs stay valid under the old multiple and say so | minutes |
| The thirty minute window proves wrong for this pair | Both halves move together or neither does, per section 3.1 | one hour |
| The report says the note misses almost everything | That is a result, and it is the one phase 2 exists to produce | not applicable |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the baseline should be a trailing window rather than the whole period | A period long enough that volatility changes inside it |
| Whether a move with no release but with news counts as noise or as a miss | Phase 5, when news text enters the note |
| How many days the period needs before these numbers mean anything | Two configurations of the note differ by less than the run to run variation |

## 9. The first report

Run 2026-08-23 19:38 +0200 over the only period that has both quotes and a calendar, which is one
trading day. The threshold was not touched between section 3.1 and this run.

    Price report, 2026-08-20 to 2026-08-21
    30 minute windows, abnormal at 3 times the baseline, baseline 3.7 pips over 40 windows
      2026-08-20 excluded, no calendar snapshot on or before it

    No abnormal move in the period.

Zero abnormal moves, and that is the finding.

## 9.1 What the first run says about the definition, and what was not done about it

An earlier run of the same code over both days, before 2026-08-20 was excluded, gave a baseline of
2.4 pips over 89 windows and found 13 abnormal moves, 2 of them explained, with noise 5 of 10. The
same day, measured alone, has a baseline of 3.7 pips and nothing abnormal at all.

Nothing about the market changed between those two runs. The baseline is the median of the period,
so a quiet Thursday dragged the median down and made an ordinary Friday look violent. One day in or
out moves the threshold by half.

That is open question 1 of section 8 arriving on the first run rather than in a month, and it is a
defect in the definition rather than in the code. The definition stays exactly as section 3.1 fixed
it, because changing a threshold after seeing that it gave an inconvenient answer is the specific
failure this document was written to prevent. It changes when there is enough data to choose a
trailing baseline on evidence, and the old runs stay valid under the old rule and say so.

The honest reading of run one: the sample is one day, forty windows, and no number here means
anything yet. What it does establish is that both reports run end to end on real data, that the
leakage rule holds, and that the threshold needs a trailing baseline before the numbers can be
believed.

## 9.2 The confound that was fixed rather than recorded

The first run counted eight abnormal moves on 2026-08-20 as unexplained. None of them could have
been explained: the calendar archive begins on 2026-08-21, so that day has no releases at all, and
the note for it cannot be built either.

Counting a day with no calendar as a day the note missed would have made the note look worse than it
is, which is the same crime as making it look better. A day without a snapshot is now excluded and
named in the report header, which is behaviour 8.
