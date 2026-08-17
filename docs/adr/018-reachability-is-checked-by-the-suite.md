# ADR-018: Reachability is checked by the suite, not by reading the code

Status: accepted
Owner: repository owner
Last change: 2026-08-17 12:47:23 +0200
Supersedes: none

## 1. Problem

Code that is written, tested and never called is the most frequent defect in this repository, and the
suite cannot see it.

The record, in order. `src/eval/categories.js` on 2026-08-15, written and never called. The
`no-magic-numbers` rule, claimed by a document and absent from the configuration. `SearchRequestSchema`,
exported and validating nothing, recorded in `docs/adr/011-one-cutoff-one-origin.md` section 7.2.
`searchMode`, a control the interface could change that reached no code. `searchThreshold`, a slider
that moved a number the search route did not read. `docs/reference/system-anatomy.md` section 7 lists
these five and adds `src/dispatcher.js` and `src/eval/intent-selection.js`.

None was caught by the suite. Every one was caught by a person reading the repository, four of them by
comparing a document's behaviour list against its test table, one by searching the configuration for a
rule name.

An audit on 2026-08-17 between 11:50:00 and 12:45:00 +0200 rebuilt the import graph and found the list
was incomplete. Three modules under `src/` are unreachable, sixteen exported names have no reference
outside the test suite, and five of the eleven keys the Settings page can write are read by nothing.
`SearchRequestSchema` is among them, still dead, although `docs/reference/system-anatomy.md` section 7
states it was connected or removed on 2026-08-16.

Coverage is not the instrument. `src/dispatcher.js` reports 100 percent statement coverage and has no
caller. `src/eval/intent-selection.js` reports 100 percent and has no caller. A test that calls dead
code covers it perfectly, which is why the threshold in `jest.config.js` has never once failed on this
class of defect.

The cost is measured rather than argued. Finding these seven modules took two days of reading spread
over 2026-08-15 and 2026-08-16, plus 55 minutes on 2026-08-17, and the answer was out of date the day
after each pass.

## 2. Decision

The check becomes a test, so the same question is answered on every run instead of by an audit.

`__tests__/reachability.test.js` reads the repository, builds the import graph from `src/server.js`
and everything in `scripts/`, and fails when a module, an exported name or a settings key is not
reached. What is already dead today is listed in the file, in three lists that only shrink.

Proof of need: section 3 below.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | Seven modules found dead by hand between 2026-08-15 and 2026-08-17, none of them by the suite. The most recent audit, 2026-08-17 11:50:00 to 12:45:00 +0200, found three unreachable modules, sixteen unused exports and five unread settings keys that the previous two audits had missed |
| 2 | Cost of not doing it | The defect keeps arriving and is found by a person, late, at roughly an hour per pass. Worse, it is found by whoever happens to look, so between two passes the repository's own reference document states things that are not true, which happened to `docs/reference/system-anatomy.md` section 7 within a day of being written |
| 3 | Cheapest alternative | A dependency such as `knip` or `depcheck`. Rejected for two reasons: it adds a dependency and a second configuration to keep current, per `docs/standards/DEPENDENCY_STANDARD.md`, and neither tool knows about the settings table, which is where two of the five recorded defects lived. The check is 120 lines against a graph this repository already builds in three places |
| 4 | Kill criterion | The debt lists stop shrinking and start being appended to, or the test fails for a reason that is not a defect more than twice. Either means the rule is wrong rather than the code |
| 5 | Signal | The length of the three lists in `__tests__/reachability.test.js`. It is 3, 16 and 5 on 2026-08-17 12:47:23 +0200, and every commit that shortens one is the check working |

## 4. Scope

In scope:
- Modules under `src/`, reached from `src/server.js` and from every file in `scripts/`.
- Names exported by those modules.
- The keys of `SETTINGS_SCHEMA` in `src/routes/settings.js`, against `config.live` calls under `src/`.

Out of scope:
- `client/`, because the owner stated on 2026-08-17 12:15:00 +0200 that the interface is not built yet,
  so every finding there would be noise. `docs/adr/005-client-test-runner.md` owns the client suite and
  this check is added there when the interface is real.
- Unused npm dependencies, because that is `docs/standards/DEPENDENCY_STANDARD.md`'s subject and a
  different graph.
- Dead code inside a function, which the linter's `no-unused-vars` already reports.

## 5. Why three lists rather than one gate

The three lists are debt, in the sense `docs/standards/COMPLEXITY.md` section 5 uses: what predates the
rule is recorded, and the rule applies in full to everything after it.

Two rules govern them, copied from that document because they are what makes a debt list work.

- A list only shrinks. Removing an entry is a normal refactor and needs no permission.
- Adding an entry requires an ADR that passes the proof of need, and the answer is expected to be no.
  The alternative is always available: connect it, or delete it.

The fourth test is what makes this true rather than intended. It fails when a list names something that
is no longer dead, so an entry cannot be left behind after the code it described was fixed. That is the
mechanism `docs/standards/COMPLEXITY.md` lacks, where the definition of done asks a person to keep
`COMPLEXITY_EXEMPT` and the document's table in step.

## 6. Behaviours

1. Every module under `src/` is reached from `src/server.js` or from a file in `scripts/`, unless it is
   named in the unreachable list.
2. Every name exported by a reached module under `src/` is referenced by at least one file that is not
   a test, unless it is named in the unused export list.
3. Every key of `SETTINGS_SCHEMA` in `src/routes/settings.js` is read by a `config.live` call in a file
   under `src/`, unless it is named in the unread settings list.
4. Each of the three lists fails the run when it names something that is no longer dead.

## 7. Tests

| # | Level | File |
|---|---|---|
| 1 | L1 | `__tests__/reachability.test.js` |
| 2 | L1 | `__tests__/reachability.test.js` |
| 3 | L1 | `__tests__/reachability.test.js` |
| 4 | L1 | `__tests__/reachability.test.js` |

These read the source text rather than calling a function, which
`docs/standards/TESTING_STANDARD.md` treats as unusual. It is the same exception
`docs/adr/011-one-cutoff-one-origin.md` section 7.1 took for its behaviour 7, and for the same reason:
the defect is a name that exists in a place nobody looks, and only a check over the text can see it.

## 8. Definition of done

- Every behaviour in section 6 has a passing test.
- `npm run verify` is green.
- The check runs before a push without the person remembering to run it, through
  `.githooks/pre-push` and `git config core.hooksPath .githooks`.
- The three lists match what the repository actually contains at the moment this ADR is dated, so the
  first run is green and every later failure is new.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| The check reports something that is not a defect | Add the case to the relevant list with one line saying why, and open the question here. If it happens a third time, the kill criterion in section 3 is met and the test is deleted | 10 minutes |
| The pre-push hook is in the way | `git config --unset core.hooksPath`. The test still runs in `npm run verify` and in CI | 1 minute |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the sixteen unused exports are deleted or connected | The next time each module is touched for another reason, per the rule in `docs/standards/COMPLEXITY.md` section 5 |
| Whether the five unread settings keys are wired to code or removed from the Settings page | A person changes one of them and nothing happens. They are defects rather than decisions, so `docs/standards/DECISION_PROTOCOL.md` section 2 does not govern them and the record of them is the `UNREAD_SETTINGS` list in the test, not a plan |
| Whether the same check is applied to `client/` | The interface stops being a draft |
