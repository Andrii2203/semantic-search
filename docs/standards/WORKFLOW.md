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

The gate runs inside Docker, not on the host. `better-sqlite3` is a native module, and on a Windows
host without the Microsoft build tools `npm install` fails at node-gyp, so the gate cannot run there
at all. The container is Linux and matches CI, which removes the whole class of works on my machine.

```
docker run --rm -v "$PWD:/app" -v semantic-search-node-modules:/app/node_modules \
  -w /app -e CI=true node:20-slim sh -c "npm run lint && npx jest --forceExit --coverage"

docker run --rm -v "$PWD:/app" -v semantic-search-client-node-modules:/app/client/node_modules \
  -w /app/client -e CI=true node:20-slim sh -c "npm ci && npm run test"
```

The two named volumes hold the installed modules, so the first run pays the install and later runs do
not. Host `node_modules` is never used, because a module built for Windows and a module built for
Linux cannot share a directory. The first run of the backend volume additionally needs
`apt-get install -y python3 make g++` before `npm ci`, which is what builds the native module.

Recorded green on 2026-08-13: lint 0 errors and 3 unused variable warnings, 532 backend tests passed
and 6 skipped, 20 client tests passed.

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
