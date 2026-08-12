# Workflow

Status: active
Owner: repository owner
Last change: 2026-08-12

## 1. Problem

Work used to start in the editor. Plans were written after the fact or in parallel, tests were added
to lift a coverage number, and the two drifted apart until a broken mock could sit in the suite
unnoticed. The order of work has to be fixed so that intent always exists before implementation.

## 2. The order

Every change follows the same four steps. No step may be skipped, and no step may be run out of
order.

```
1. DOCUMENT      what must be true when this is done
2. TESTS         the executable form of step 1, red
3. CODE          until step 2 is green
4. GATE          npm run verify, then report
```

### Step 1: document

Write or update the document that owns this behaviour, using `DOCUMENT_TEMPLATE.md`.
The important part is section 4 of the template, the behaviour list. Each line there is a single
statement that is either true or false about the running system. If a line cannot be checked by a
machine, it is not a behaviour, it is a wish. Rewrite it or drop it.

If the change adds a feature, a dependency or an abstraction, run `DECISION_PROTOCOL.md` first and
record the result as an ADR. A document that describes something nobody proved is needed is still
waste, only in prose form.

### Step 2: tests

Turn every line of the behaviour list into a test, following `TESTING_STANDARD.md`. Run them.
They must fail, and the failure message must be about the missing behaviour, not about a typo, a
missing import or a broken fixture. A test that fails for the wrong reason has not been verified.

### Step 3: code

Write the smallest code that turns the tests green.

While in this step the test files are frozen. If a test looks wrong, that is a signal that step 1 was
wrong. Go back to the document, correct the behaviour line, correct the test, and only then continue.
Editing a test to match code you already wrote is the one move this workflow exists to prevent.

### Step 4: gate

```
npm run verify
```

This runs lint, the complexity limits and the whole test suite. It is the same command CI runs.
Green locally and green in CI mean the same thing, so there is never a reason to push and hope.

## 3. What counts as done

A change is done when all of the following hold.

| Check | How it is verified |
|---|---|
| The document exists and is current | The behaviour list matches observable behaviour |
| Every behaviour has a test | One to one, checked by name |
| Every test maps to a behaviour | No orphan tests |
| `npm run verify` is green | Command exit code 0 |
| No comments were added to source | Review of the diff |
| Deferred work is written down | An entry with a revisit trigger, per the decision protocol |

Partly done is not done. If part of the scope turns out to be blocked, finish everything else and
write down exactly what was left and why.

## 4. Branches and commits

- `main` is the deployed product. It is never the place where work happens.
- One branch per phase or per fix: `feature/<phase>-<slug>` or `fix/<slug>`.
- Conventional commits with the phase in scope: `feat(phase-3): settings persistence`.
- The commit that introduces behaviour contains its document, its tests and its code together.
  A commit with code and no tests, or tests and no document, is incomplete by definition.

## 5. When something breaks in production

1. Reproduce it as a failing test first. The test goes into the suite permanently.
2. Then fix the code.
3. Then update the document if the behaviour list was wrong or silent about the case.

A production bug that leaves no test behind will come back.
