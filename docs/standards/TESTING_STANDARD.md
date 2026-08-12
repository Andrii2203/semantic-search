# Testing standard

Status: active
Owner: repository owner
Last change: 2026-08-12

## 1. Problem

The suite has 483 tests. Six of them broke and nothing in the workflow caught it, because a mock in a
catch all file was left on an old library API while the code moved on. A large part of the rest was
written to reach a coverage threshold, not to catch a defect. Count of tests says nothing. This
document defines the one way tests are written here, so that every test in the repository looks the
same and earns its place.

## 2. The acceptance question

Before a test is kept, answer this out loud:

> Which single line of production code can I break so that this test goes red, and nothing else
> catches it?

If there is no such line, the test does not protect anything. Delete it.
If the answer is "any line, it just checks the mock was called", the test protects the mock, not the
system. Rewrite it against observable state.

This question replaces coverage as the decision rule. Coverage stays as a smoke alarm at 80 percent,
but a change that lifts coverage without adding a defect it can catch is rejected.

## 3. The four levels

Every test belongs to exactly one level. The level decides what may be faked.

| Level | Name | What it tests | What may be faked |
|---|---|---|---|
| L1 | Pure | A function with no I/O: chunkers, scoring, parsers, validation, fingerprints | Nothing |
| L2 | Module | A module against real collaborators: db, scheduler, search engine, feedback | Only level 4 boundaries |
| L3 | Contract | An HTTP route through the real Express app with supertest | Only level 4 boundaries |
| L4 | Boundary | The adapter that talks to the outside: Groq, Hacker News, Reddit, Djinni, the PDF library, the clock | The outside itself |

Rules that follow from the table.

- SQLite is never mocked. Tests use `:memory:` and the real schema and the real migrations.
- Express is never mocked. Routes are exercised through `supertest` against the real app.
- Our own modules are never mocked by other modules of ours. If module A cannot be tested without
  faking module B, the coupling is the defect, not the test.
- Everything that crosses the process boundary is always faked, in every level except L4 itself.
  Network calls in tests are a bug: they make the suite slow, flaky and dependent on someone else's
  uptime.

## 4. Boundary fakes have a contract test

A fake is a lie about someone else's API. That lie decays. Every faked boundary therefore has one
extra test at level 4 that pins the shape of the real API:

- The fake and the real adapter are checked against the same expected shape.
- When the library or the API changes, that one test fails and points at the fake.

This is exactly the defect that was in the repository: `pdf-parse` moved from a function export to a
class export, the source and the shared fake were updated, an inline fake inside a test file was
not, and six tests failed with `PDFParse is not a constructor`. A boundary contract test would have
named the cause in one line.

Practical rule: one fake per boundary, defined once under `__mocks__/` or `__tests__/support/`, never
redefined inline inside a test file. Inline `jest.doMock` of a boundary is forbidden. If a single
test needs the boundary to fail, the shared fake exposes a way to make it fail.

## 5. Naming and location

- The test file mirrors the source path: `src/routes/items.js` is tested by
  `__tests__/routes/items.test.js`. No exceptions and no catch all files.
- One `describe` per unit under test, named with the path: `describe('src/routes/items.js', ...)`.
- A test name is a full sentence in the present tense that states the condition and the observable
  result:

```
returns 401 when the session cookie is missing
stores one chunk when two sources publish the same story
keeps the saved profile unchanged when the search is a files search
```

Never `works`, `handles errors`, `test 1`, `should be defined`. If the name does not survive being
read out to a person who has not seen the code, it is not a name.

## 6. Shape of a test

Three blocks, separated by one blank line, in this order: arrange, act, assert. No comments, no
headers inside the body (rule 7 of the entry point). The blank lines carry the structure.

```js
test('returns 401 when the session cookie is missing', async () => {
  const app = createTestApp();

  const response = await request(app).get('/api/items');

  expect(response.status).toBe(401);
});
```

- One behaviour per test. Two acts in one body means two tests.
- Assert on observable state: the HTTP response, the row in the database, the returned value.
- Do not assert that a function of ours was called. That is implementation, and it locks the code
  into its current shape.
- One exception, and it is deliberate: asserting that a paid external call did NOT happen is
  allowed and expected, because "does not spend money unless asked" is real behaviour.

```js
expect(groqCalls).toHaveLength(0);
```

- Table driven cases use `test.each` only when every row exercises the same single behaviour with
  different data. Different behaviours never share a loop.

## 7. Forbidden

| Pattern | Why it is out |
|---|---|
| A catch all file such as `integration-tests-uncovered.test.js` | Nobody knows what it covers, and it hid a real break |
| Inline `jest.doMock` of a boundary | Produces two versions of the same lie, which drift |
| `expect(mock).toHaveBeenCalledWith(...)` as the only assertion | Tests the call, not the result |
| Snapshots of large objects | Approved blindly, changed blindly |
| `istanbul ignore` added to pass the threshold | Hides untested logic instead of testing it |
| A test with no possible failure, such as `expect(true).toBe(true)` | Noise |
| Reading the implementation to decide what to assert | Produces a mirror of the code, not a check on it |
| Network access from a test | Slow, flaky, and dependent on a third party |

`istanbul ignore` remains legitimate in exactly three places, and each one must carry the reason on
the same line: model loading, embedding generation, and process signal handlers.

## 8. Traceability

Section 4 of every document is a numbered behaviour list. Test names repeat those lines verbatim.
That gives a two way check with no tooling:

- A behaviour with no test: the feature is not verified, the change is not done.
- A test with no behaviour: either the document is missing a line, or the test is protecting
  something nobody asked for. Both are resolved before merge, and the document wins.

## 9. How to verify a test is real

Run this by hand once for every new test, it takes seconds.

1. Break the line of production code the test is supposed to protect. Invert a condition, return a
   constant, drop a filter.
2. Run only that test file.
3. It must go red, and the message must point at the broken behaviour.
4. Restore the code. It must go green.

A test that stays green in step 3 is deleted, not fixed. A test that goes red in step 3 with an
unrelated message is rewritten so the message is about the behaviour.

## 10. What to do when a test fails

In order.

1. Assume the code is wrong. This is the normal case, and the reason the suite exists.
2. If the code is right, the behaviour changed. Update the document first, then the test, then the
   code. Never the test alone.
3. If the failure is in a fake, fix the fake once, in the shared place, and add the boundary contract
   test that would have caught it.

Editing a test so it passes against code that is already written is the one move this repository does
not allow.

## 11. Fixtures and helpers

- Shared setup lives in `__tests__/support/`. It builds real objects: an in memory database, a
  configured Express app, a valid session cookie, a synthetic PDF buffer.
- A helper never contains assertions. Assertions live in the test that is named after them.
- Test data is minimal and inline where it is read. A fixture that is used once belongs in the test.

## 12. Coverage

The threshold stays at 80 percent for statements, branches, functions and lines. Its only job is to
show a module that nobody tested at all. It is never a target, never a justification for a test, and
never a reason to add an ignore comment. A pull request that raises coverage and adds no behaviour it
can catch is rejected under section 2.
