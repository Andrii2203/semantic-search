# Dependency upgrade

Status: draft
Owner: repository owner
Last change: 2026-08-15 11:10:48 +0200
Supersedes: none

## 1. Problem

Every number this project has produced was produced by a toolchain nobody had checked.

Read from the npm registry with `npm view <package> version` on 2026-08-15, between 11:06 and 11:09
+0200, clock read once at 11:10:48 +0200. Node end of life dates read at
https://endoflife.date/nodejs and https://eslint.org/blog/2026/02/eslint-v10.0.0-released/ on
2026-08-15 at 11:08 +0200.

Three findings outrank the rest.

The runtime is dead. Node 20 reached end of life on 2026-04-30 and receives no security patches. All
four stages of the `Dockerfile` are `node:20-slim` and `engines` requires `>=20.19.0`. Node 24 is the
Active LTS line until 2028-04-30.

The linter is two majors behind and both intermediate majors are gone. This repository lints with
ESLint 8 through `.eslintrc.json`. ESLint 9 reached end of life on 2026-08-06. ESLint 10, released in
February 2026, removed the eslintrc system completely and ignores `.eslintrc.json` rather than failing
on it. So a naive bump of the linter would produce a green lint run that checks nothing, including the
`no-magic-numbers` rule that `docs/reference/search-constants.md` behaviour 4 depends on. The client
already runs ESLint 10 with a flat config, so the two halves of this repository disagree about how
linting works.

The native module that cost a phase is fixed upstream. `docs/plans/retrieval-quality.md` section 6.1
records that `better-sqlite3` 11.10.0 had no prebuilt binary for the installed Node and fell back to a
source build that failed for want of Python. The installed range is `^11.7.0`. The current release is
13.0.3 and it declares `engines: { node: '>=22' }`, which means the 11 line is not merely old, it
predates the runtime this project should be on.

## 2. Decision

Every dependency is brought to its current major, in the order in section 5, one commit per package
so that a failure names its own cause. The runtime moves to Node 24. The linter moves to ESLint 10
with a flat config that carries the same complexity and magic number rules the current one does.

Proof of need: `docs/standards/DEPENDENCY_STANDARD.md` section 2, rules 2 and 3, and the defect in
`docs/plans/retrieval-quality.md` section 6.1 which `docs/standards/DECISION_PROTOCOL.md` section 2
exempts from the protocol.

## 3. Scope

In scope:
- `package.json` and `client/package.json`, every dependency and dev dependency.
- The Node version in `Dockerfile`, in `engines` and in the commands of `docs/standards/WORKFLOW.md`.
- Migration of `.eslintrc.json` to flat config, preserving the rules that enforce
  `docs/standards/COMPLEXITY.md` and `docs/reference/search-constants.md` behaviour 4.

Out of scope, each with its reason:
- Changing the embedding model, because it is a retrieval decision carried by
  `docs/adr/012-multilingual-embedding-model.md` and measured, not a version bump.
- Removing `groq-sdk`, because whether the language model paths survive is the open question in
  `docs/plans/retrieval-quality.md` section 12 and is answered by axis D and axis E.
- Adding a vector index extension such as `sqlite-vec`. Its own repository states it is pre v1 with
  breaking changes expected, read at https://github.com/asg017/sqlite-vec on 2026-08-15 11:03 +0200,
  and `docs/plans/retrieval-quality.md` section 3 requires a latency trigger that has not happened.

## 4. The audit

Installed is the range in the manifest. Latest is the registry answer at the read time in section 1.

Backend runtime dependencies:

| Package | Installed | Latest | Behind | Note |
|---|---|---|---|---|
| `better-sqlite3` | ^11.7.0 | 13.0.3 | two majors | 13 requires Node >= 22. This is the package that cost phase 0 |
| `express` | ^4.21.1 | 5.2.1 | one major | Router and path matching changed in 5 |
| `zod` | ^3.24.1 | 4.4.3 | one major | Error and issue API changed. Used by `src/validation.js` |
| `pino` | ^9.5.0 | 10.3.1 | one major | |
| `pino-http` | ^10.3.0 | 11.0.0 | one major | Moves with `pino` |
| `node-cron` | ^3.0.3 | 4.6.0 | one major | Drives the ingest cycle in `src/scheduler.js` |
| `dotenv` | ^16.4.7 | 17.4.2 | one major | |
| `express-rate-limit` | ^7.4.1 | 8.6.2 | one major | |
| `@anthropic-ai/sdk` | ^0.116.0 | 0.117.1 | minor | The judge path of `docs/adr/007-judge-on-anthropic.md` |
| `groq-sdk` | ^1.1.2 | 1.5.0 | minor | |
| `onnxruntime-node` | ^1.26.0 | 1.27.0 | minor | Moves with the model runtime |
| `helmet` | ^8.0.0 | 8.3.0 | minor | |
| `multer` | ^2.1.1 | 2.2.0 | minor | |
| `pino-pretty` | ^13.0.0 | 13.1.3 | minor | |
| `cors` | ^2.8.5 | 2.8.6 | patch | |
| `@huggingface/transformers` | ^4.2.0 | 4.2.0 | current | The embedding runtime is already current |
| `bcryptjs` | ^3.0.3 | 3.0.3 | current | |
| `pdf-parse` | ^2.4.5 | 2.4.5 | current | |

Backend development dependencies:

| Package | Installed | Latest | Behind | Note |
|---|---|---|---|---|
| `eslint` | ^8.57.1 | 10.8.1 | two majors | 8 and 9 are both end of life. 10 ignores `.eslintrc.json` |
| `eslint-plugin-sonarjs` | ^1.0.4 | 4.2.0 | three majors | Carries the cognitive complexity rules of `docs/standards/COMPLEXITY.md` |
| `jest` | ^29.7.0 | 30.4.2 | one major | 575 tests depend on it |
| `prettier` | ^3.4.2 | 3.9.6 | minor | |
| `pdf-lib` | ^1.17.1 | 1.17.1 | current | |
| `supertest` | ^7.2.2 | 7.2.2 | current | |

Client, which is in far better shape than the backend:

| Package | Installed | Latest | Behind | Note |
|---|---|---|---|---|
| `jsdom` | ^25.0.1 | 30.0.1 | five majors | The test environment of `docs/adr/005-client-test-runner.md` |
| `vitest` | ^3.2.7 | 4.1.10 | one major | |
| `lucide-react` | ^1.11.0 | 1.31.0 | minor | |
| `react`, `react-dom` | ^19.2.5 | 19.2.8 | patch | |
| `vite` | ^8.0.10 | 8.2.1 | minor | |
| `tailwindcss`, `@tailwindcss/postcss` | ^4.2.4 | 4.3.3 | minor | |
| `radix-ui` | ^1.4.3 | 1.6.7 | minor | |
| `@tanstack/react-query` | ^5.100.9 | 5.101.4 | patch | |
| `zustand` | ^5.0.13 | 5.0.15 | patch | |
| `shadcn` | ^4.5.0 | 4.18.0 | minor | |
| `eslint` | ^10.2.1 | 10.8.1 | minor | Already on the flat config the backend needs |

Runtime:

| Thing | Installed | Current | Note |
|---|---|---|---|
| Node in `Dockerfile`, four stages | 20-slim | 24 is Active LTS to 2028-04-30 | Node 20 ended 2026-04-30. Node 26 is Current and becomes LTS in October 2026 |
| Node in `engines` | >=20.19.0 | >=22, forced by `better-sqlite3` 13 | |

## 5. Order of work

Dependencies decide the order, not risk.

| # | Step | Why here |
|---|---|---|
| 1 | Node 24 in `.nvmrc`, in `engines` with `engine-strict=true`, in every `Dockerfile` stage and in `.github/workflows/ci.yml`, with `better-sqlite3` 13 | The two are one change. 13 needs Node >= 22 and Node 24 needs a `better-sqlite3` that has prebuilt binaries for it. Doing them separately reproduces phase 0. The version currently lives in four places, three of which say 20 while the host runs 24, and that gap is the whole defect |
| 2 | ESLint 10 with flat config, and `eslint-plugin-sonarjs` 4 | Nothing else can be verified until the gate itself is trustworthy. The migration tool is `npx @eslint/migrate-config .eslintrc.json`, and the result is checked by asserting that a deliberate magic number still fails the run |
| 3 | Jest 30 | The suite is the evidence for every step after this one |
| 4 | `zod` 4, then `express` 5 with `express-rate-limit` 8 | The request path. Zod first because `src/validation.js` is what Express routes call |
| 5 | `pino` 10 with `pino-http` 11, `node-cron` 4, `dotenv` 17 | Independent of each other and of the request path |
| 6 | Minors and patches, in one commit | No behaviour expected, so no reason to spend a commit each |
| 7 | Client: `jsdom` 30 and `vitest` 4, then the minors | Isolated by `docs/adr/005-client-test-runner.md` from the backend suite |

Step 1 carries a claim worth testing early, and it is stated as an expectation rather than a fact:
with Node 24 and `better-sqlite3` 13, `npm install` should find a prebuilt binary and no longer need
Python and a compiler, which would make the Docker only gate of `docs/standards/WORKFLOW.md` a choice
rather than the only option. That is verified by running it on the host, once.

## 6. Behaviours

1. `npm install` on a clean checkout succeeds on the Node version named in `engines`.
2. `npm run lint` fails on a file containing a magic number in the retrieval path, after the flat
   config migration, exactly as it did before it.
3. `npm run lint` fails on a function exceeding the cognitive complexity limit of
   `docs/standards/COMPLEXITY.md`, after the migration.
4. The major version of Node in `engines` matches the one in every `Dockerfile` stage.
5. `npm run verify` is green on the upgraded tree, with the same test count as before the upgrade.

## 7. Tests

| # | Level | File |
|---|---|---|
| 1 | not a test | a measurement, run once per step and recorded in this document |
| 2 | not a test | a deliberate violation checked by hand at migration time, because the linter cannot lint itself |
| 3 | not a test | same reason |
| 4 | L1 | `__tests__/engines.test.js` |
| 5 | not a test | the gate itself |

Behaviours 2 and 3 are the ones that matter and none of them is a unit test, which is uncomfortable
and is the point: a linter that silently stops enforcing is invisible to a test suite. They are
checked by introducing a violation and watching the run fail, once per migration.

## 8. Definition of done

- Every row in section 4 marked behind is either upgraded or carries a reason and a trigger.
- `npm run verify` is green on Node 24 with the same test count as the 2026-08-14 run: 61 suites, 575
  tests passed.
- `docs/standards/WORKFLOW.md` section 2 is rewritten if step 1 makes the host gate usable again.
- The audit is re-read at the start of the next phase, per `docs/standards/DEPENDENCY_STANDARD.md`.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| A package upgrade breaks the suite | One commit per package, so the revert is one commit | minutes |
| Express 5 changes route behaviour in a way the tests do not cover | The route tests are L3 and cover the request path. A gap found here becomes a test before the revert | hours |
| Node 24 breaks the native module after all | Node 22 is Maintenance LTS until 2027-04-30 and also satisfies `better-sqlite3` 13 | 30 minutes |
| The flat config loses a rule silently | Behaviour 2 and 3 are checked by deliberate violation before the commit lands | 20 minutes |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the Docker only gate is still needed once step 1 lands | Step 1 is done and `npm install` is run on the host once |
| Whether `groq-sdk` stays a dependency at all | Axis D and axis E report with the language model paths disabled |
| Whether a lockfile is committed | Two machines produce different trees from the same manifest |
| Whether Node 26 is taken instead of 24 in October 2026, when it becomes LTS | The next audit after October 2026 |
