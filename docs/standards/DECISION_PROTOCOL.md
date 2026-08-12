# Decision protocol

Status: active
Owner: repository owner
Last change: 2026-08-12

## 1. Problem

The plans in this repository already describe phase five and a pricing model, while the running
system could not start its own production container. Ideas arrive faster than evidence, and an idea
that is written down starts to look decided. Both directions need a procedure: proving that something
is needed, and proving that something is not. Without the second one, nothing is ever removed and the
backlog only grows.

## 2. When this applies

Run this protocol before any of the following.

- A new feature, or a new phase of an existing feature.
- A new dependency, in the backend or the client.
- A new abstraction: a layer, an adapter, a registry, a queue, a worker thread.
- A new external service, paid or free.
- Deleting or archiving something that already exists.

It does not apply to defect fixes. A defect is proven by the failing test that reproduces it.

## 3. Proof of need

Five questions. All five need an answer. Missing any one means the answer is not now.

| # | Question | What a valid answer looks like |
|---|---|---|
| 1 | Trigger | The real event that happened, with a number or a date. "Ingest cycle took 14 minutes on 194 items on 2026-08-12." Not "users will want this." |
| 2 | Cost of not doing it | What breaks, degrades or stays impossible if this is never built. Stated in time, money or a blocked behaviour. |
| 3 | Cheapest alternative | The simplest thing that removes the same pain, including doing nothing, a constant, a manual step, or a different tool. Why it is not enough. |
| 4 | Kill criterion | The observation that would prove this was a mistake, decided before the work starts. |
| 5 | Signal | The metric or the log line that will show it worked, and where it will be read. |

Question 1 does most of the work. A trigger is something that already happened. A prediction is not a
trigger. If the honest answer to question 1 is "it feels right", the item goes to the deferred list
in section 5 with the trigger that would promote it.

## 4. Proof of not needed

Symmetric, and used to close items rather than open them. Three of the five are enough, but the
reasoning is written down in full.

| # | Question | What a valid answer looks like |
|---|---|---|
| 1 | Absent trigger | The condition that would justify it has not occurred, and here is the measurement showing it. |
| 2 | Cheaper path covers it | An existing mechanism already removes most of the pain. Name it. |
| 3 | Cost exceeds benefit | The build or run cost, against the value in the same units. |
| 4 | Reversibility | How hard it would be to add later. Easy to add later means safe to skip now. |
| 5 | Carrying cost | What it costs to keep the option open: code paths, config toggles, documentation, tests. |

The output is not silence. It is a written entry, because an undocumented no is indistinguishable
from an oversight and will be proposed again in two weeks.

## 5. Output

Every run of this protocol produces one file in `docs/adr/`, numbered in sequence, using the document
template. Its header carries one of four statuses.

| Status | Meaning | What follows |
|---|---|---|
| accepted | Proof of need passed | It enters a plan and gets built |
| rejected | Proof of not needed passed | It is closed. Reopening requires a new trigger, not a new opinion |
| deferred | Neither proof passed | It waits, with the exact trigger that promotes it recorded |
| superseded | A later decision replaced it | Link to the replacement. The file is not edited otherwise |

A deferred item carries a trigger, never a date. "When ingest exceeds ten minutes" is a trigger.
"Next month" is a wish, and it will be moved again next month.

## 6. Worked example, accepted

Subject: replace memory storage with disk storage for uploads.

1. Trigger: upload accepts 200 files at 10 MB, held in RAM. Two concurrent requests exceed the memory
   of the target host, which is a 24 GB shared instance running the model as well.
2. Cost of not doing it: the process dies during a user visible action and takes the scheduler with it.
3. Cheapest alternative: lower the file limit. Rejected, it caps a real use case, batch matching of a
   large document library, which is the point of files mode.
4. Kill criterion: if disk parsing makes a 50 file upload slower than 60 seconds, revisit with a queue.
5. Signal: peak resident memory during upload, in the log line at the end of the request.

Status: accepted.

## 7. Worked example, rejected

Subject: classify every ingested item with the language model, high, normal or junk.

1. Absent trigger: the deterministic pre filter already drops 120 of 194 items in a real cycle. There
   is no measurement showing that what survives is noisy.
2. Cheaper path: the same filter, extended with one more rule, costs nothing per item.
3. Cost exceeds benefit: roughly 0.0005 dollars per item on every cycle, forever, against an unproven
   improvement.
4. Reversibility: trivial to add later, it is one call inside the existing cycle.
5. Carrying cost: a settings toggle, a metadata field, a badge in the UI, and tests for all three.

Status: rejected. Trigger that would reopen it: a cycle where more than a third of the items that pass
the pre filter are skipped by the user within one day.

## 8. Behaviours

Not applicable. This document governs decisions, it does not change the running system.

## 9. Definition of done

- Every accepted item in a plan links to its ADR.
- Every deferred item carries a trigger.
- No feature enters `docs/plans/` without one of the two proofs behind it.
