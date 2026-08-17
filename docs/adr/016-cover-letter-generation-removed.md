# ADR-016: Cover letter generation is removed

Status: rejected
Owner: repository owner
Last change: 2026-08-17 12:47:23 +0200
Supersedes: none

## 1. Problem

`src/actions/generate-cover.js` generates a cover letter for an item of type `job`. It was written for
the earlier shape of this product, a job hunting assistant, and it does not belong to the universal
matching engine described in `docs/product/VISION.md`.

It is also unreachable. Measured 2026-08-17 12:20:00 +0200 by an import graph over the 87 JavaScript
files in `src/` and `scripts/`: the only path to `generate-cover.run` is
`actionsRegistry.getAction('job')` inside `src/dispatcher.js`, and nothing under `src/` or `scripts/`
requires `src/dispatcher.js`. The live endpoint that generates text, `POST /api/items/:id/generate` in
`src/routes/items.js` line 104, bypasses the registry and requires `src/actions/generate-comment.js`
directly. So no request, cycle or script can reach this module.

It reports 100 percent statement coverage, because `__tests__/dispatcher.test.js` calls it through the
dispatcher that nothing else calls. That is the shape `docs/reference/system-anatomy.md` section 7
records: a module with passing tests and no caller.

## 2. Decision

The module is deleted, with its registration line and the tests that exercise it.

The owner stated on 2026-08-17 12:15:00 +0200 that cover letter generation is not part of this system
and comes from the earlier design. That is the trigger, and it is a decision about product scope
rather than a measurement.

Proof of need: section 3 below, the proof of not needed from
`docs/standards/DECISION_PROTOCOL.md` section 4.

## 3. Proof of not needed

| # | Question | Answer |
|---|---|---|
| 1 | Absent trigger | No caller exists. Measured 2026-08-17 12:20:00 +0200 over the import graph: zero paths from any entry point, and the one live generation endpoint requires a different module directly |
| 2 | Cheaper path covers it | Not applicable. Nothing needs covering, because the behaviour is not wanted. Text generation for an item already exists and stays, see `docs/adr/017-comment-generation-deferred.md` |
| 3 | Cost exceeds benefit | 78 lines carrying a Groq prompt, a retry policy and a second copy of the fetch block in `generate-comment.js`, against a feature the owner does not want |
| 4 | Reversibility | The file is one commit away in git history, and the registry it plugs into is unchanged. Restoring it is minutes |
| 5 | Carrying cost | One module, one registration line, three tests, a `job` branch in the dispatcher, and a line in every future audit of what is connected to what |

## 4. Scope

In scope:
- `src/actions/generate-cover.js`, deleted.
- Its `register` call in `src/actions/index.js`.
- The tests in `__tests__/dispatcher.test.js` that name it.

Out of scope:
- `src/dispatcher.js` and `src/actions/index.js` themselves. They are unreachable too, and that is one
  question rather than two, recorded in `docs/reference/system-anatomy.md` section 14 and untouched
  here so this file carries one decision.
- The `job` member of the type enum in `src/validation.js`, because item types are an ingest concern
  and no measurement says that enum is wrong.
- The `JobMatch` row in `docs/product/VISION.md` section on verticals, which names a cover letter as
  an example of what some future vertical could deliver. That is an illustration of the product shape,
  not a reference to this module.

## 5. Behaviours

1. No file under `src/` or `__tests__/` references `generate-cover`.
2. The action registry maps the type `post` and no other type.
3. `POST /api/items/:id/generate` still returns a generated comment for an item.

## 6. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/reachability.test.js` |
| 2 | L1 | `__tests__/dispatcher.test.js` |
| 3 | L3 | `__tests__/api.test.js` |

Behaviour 1 is a test that reads the repository rather than calling a function, for the same reason
`docs/adr/011-one-cutoff-one-origin.md` section 7.1 gives for its behaviour 7: the defect being closed
is a name surviving in places nobody looks, and only a check over the text can stop it returning.

## 7. Definition of done

- Every behaviour in section 5 has a passing test.
- `npm run verify` is green.
- No file named `generate-cover.js` exists under `src/`.

## 8. Rollback

| If | Action | Time |
|---|---|---|
| Cover letter generation is wanted again | Restore the file from this commit's parent, restore its `register` line, and write the ADR that says which vertical needs it | 30 minutes |

## 9. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether `src/dispatcher.js` and `src/actions/index.js` survive at all, now that one of their two actions is gone and the other is deferred | The next time the ingest cycle is changed to generate text per item |
