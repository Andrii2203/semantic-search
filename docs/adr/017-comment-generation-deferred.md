# ADR-017: Comment generation is deferred, and kept running while it waits

Status: deferred
Owner: repository owner
Last change: 2026-08-17 12:47:23 +0200
Supersedes: none

## 1. Problem

`src/actions/generate-comment.js` asks Groq for a short comment about an item and stores it as the
item's response. It is reachable: `POST /api/items/:id/generate` in `src/routes/items.js` line 104
requires it directly and the client calls that endpoint from the reading pane through `useGenerateComment`
in `client/src/hooks/useItems.js`.

The owner stated on 2026-08-17 12:15:00 +0200 that it is not settled whether this feature belongs to
this system. So it is neither wanted nor unwanted, and the repository has no way to record that state
in code. Left unrecorded, the next audit finds a live Groq calling feature with no document behind it
and has to ask the same question again, which is the cost
`docs/standards/DECISION_PROTOCOL.md` section 4 names: an undocumented decision is indistinguishable
from an oversight.

The distinction from `docs/adr/016-cover-letter-generation-removed.md` is the whole reason these are
two files. That module had no caller and was not wanted. This one has a caller and its future is open.

## 2. Decision

Nothing changes in the code. The feature stays exactly as it is, wired to the endpoint and the button,
and this file records that it is deferred as of 2026-08-17 12:47:23 +0200 rather than accepted.

Deferred here means: it is not built on, not extended, and not counted as a feature the product
promises. It is not removed either, because removing it would cost more than keeping it and would
throw away a working path to the language model.

Proof of need: neither proof passed, which is the definition of deferred in
`docs/standards/DECISION_PROTOCOL.md` section 5.

## 3. Why neither proof passed

Against the proof of need in `docs/standards/DECISION_PROTOCOL.md` section 3:

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | None. No measurement and no recorded use says a person wanted a generated comment on an item. The feature predates the current product shape |
| 2 | Cost of not doing it | Unknown, and honestly so. Nobody has used the inbox long enough to say whether a generated comment helps a person decide about an item |
| 3 | Cheapest alternative | `POST /api/search/explain`, which already answers why an item matched and is the question a reader of the inbox actually has |
| 4 | Kill criterion | Not decided, because the work is not starting |
| 5 | Signal | Not decided, for the same reason |

Against the proof of not needed in section 4 of the same document:

| # | Question | Answer |
|---|---|---|
| 1 | Absent trigger | True. Nothing has occurred that requires it |
| 2 | Cheaper path covers it | Partly. `explain` covers the question a reader has, but it does not produce text a person can reuse |
| 3 | Cost exceeds benefit | Cannot be stated. The run cost is one Groq call per explicit click, which is close to zero, so there is no cost to weigh against the unknown benefit |
| 4 | Reversibility | Easy either way. Removal is one endpoint, one module and one button |
| 5 | Carrying cost | Low. It is already written, already tested and costs nothing when nobody clicks |

Three of the five would have to hold to close it, and question 3 is the one that fails: a feature that
costs nothing while idle cannot be removed on cost grounds. So it waits.

## 4. Scope

In scope:
- Recording the state of `src/actions/generate-comment.js` and of `POST /api/items/:id/generate`.

Out of scope:
- Any change to the code, because the decision is to make no change.
- `src/dispatcher.js` and `src/actions/index.js`, which are unreachable and are their own question,
  recorded in `docs/reference/system-anatomy.md` section 14.

## 5. Behaviours

Not applicable. This document records a state and changes no behaviour. The endpoint keeps the
behaviour it already has, covered by `__tests__/api.test.js`.

## 6. Tests

Not applicable, for the reason in section 5. No test is added and none is removed.

## 7. Definition of done

- This file exists and is linked from `docs/reference/system-anatomy.md`.
- `npm run verify` is green, unchanged from before this file was written.

## 8. Rollback

Not applicable. Recording a deferral carries no runtime risk.

## 9. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether a generated comment is kept, replaced by `explain`, or removed | A person uses the inbox for a week and either clicks the button or does not. The count of clicks on `POST /api/items/:id/generate` over that week is the answer |
| Whether the deferral is revisited on its own | No. A deferred item carries a trigger and never a date, per `docs/standards/DECISION_PROTOCOL.md` section 5. The trigger is the row above |
