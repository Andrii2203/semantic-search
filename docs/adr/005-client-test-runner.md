# Client test runner

Status: accepted
Owner: repository owner
Last change: 2026-08-12
Supersedes: none

## 1. Problem

The suite has 496 tests and every one of them runs against the server. The client has none.

That is not a theoretical hole. Three features shipped and tested on the server were unreachable
from the interface, and nothing detected it: the search screen sends only the query and the
collection, so the HyDE switch in Settings changes nothing, the rerank action does not exist, and the
per item scores the API returns are never rendered. `client/src/stores/searchStore.js` holds search
settings that no component imports. All of this passed a green suite for weeks.

Phase 2.5 and most of phase 5 are interface work. Continuing without a way to verify the client means
repeating exactly this failure, at a larger size.

## 2. Decision

Add Vitest with Testing Library to the client workspace, and run it from the same `npm run verify`
that gates the server.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | On 2026-08-12 an audit found three server features unreachable from the interface and one dead store, all invisible to a green suite of 496 tests |
| 2 | Cost of not doing it | Every interface behaviour stays unverified. The phases that remain are mostly interface, so the blind area grows rather than shrinks |
| 3 | Cheapest alternative | Manual checking in the browser after each change. That is what was in place, and it is what missed the four defects above |
| 4 | Kill criterion | The client suite runs longer than 30 seconds, or its tests become mostly plumbing around mocks rather than assertions about what the user sees |
| 5 | Signal | Number of client behaviours from `../plans/phase-status-audit.md` section 4 that are covered by a test that can fail |

## 4. Why Vitest and not Jest

The client is a Vite application. Vitest reuses the existing `vite.config.js`, so the module
resolution, aliases and JSX transform in tests are the same ones the application runs with. Jest
would need its own transform chain and a second, divergent configuration of the same thing. The
server keeps Jest, because it works and there is no trigger to change it.

Testing Library is included because it queries the rendered result the way a person reads the screen,
by text and role, which keeps tests pointed at behaviour rather than at component internals. That is
the same rule `../standards/TESTING_STANDARD.md` section 6 applies to the server.

## 5. Consequences

- Two runners in one repository, one per workspace. `npm run verify` runs both, so there is still one
  command and one verdict.
- The client gains three development dependencies: `vitest`, `@testing-library/react`, `jsdom`.
- Requests are the observable output of the client. Asserting the body of an outgoing request is
  therefore an assertion about behaviour, not about a mock, and is allowed. Asserting that an
  internal function was called remains forbidden.

## 6. Definition of done

- `npm run verify` runs the client suite and fails when a client test fails.
- The behaviours in `../plans/phase-status-audit.md` section 4 numbered 1 to 5 have tests.
