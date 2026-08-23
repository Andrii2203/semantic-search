# ADR-023: The Hub's frontend gets a test runner

Status: accepted
Owner: repository owner
Last change: 2026-08-23 22:03:29 +0200
Supersedes: none

## 1. Problem

The Hub's frontend has no tests at all. `docs/plans/hub-audit.md` section 6 counted the suite as
found: seven unit specs under `backend/src`, one integration spec under `backend/tests`, none in the
frontend.

That already cost something measurable. Recommendations 5 and 6 of the Hub review, filter state in
the URL and the Bull Board locale, are recorded in `docs/plans/hub-audit.md` section 4.1 as not
checked, with the reason given in words: no screen could be driven.

The search screen of `docs/plans/retrieval-in-the-hub.md` is the first frontend work with a
behaviour list. Shipping it with no way to run those behaviours would repeat the failure ADR-005
describes on the other repository, where three server features were unreachable from the interface
and a green suite of 496 tests said nothing.

## 2. Decision

Vitest with Testing Library in the Hub's frontend workspace, run by `npm test` there, the same pair
`docs/adr/005-client-test-runner.md` chose for the search repository's client.

Proof of need: section 3.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | Two recommendations of the Hub review could not be checked on 2026-08-22 because no screen could be driven, recorded in `docs/plans/hub-audit.md` section 4.1, and a screen with four behaviours was written on 2026-08-23 |
| 2 | Cost of not doing it | Every interface behaviour of the Hub stays unverified, and the product is mostly interface |
| 3 | Cheapest alternative | Opening the page by hand after each change. That is what has been in place, and it is what left recommendations 5 and 6 unchecked for a day and the frontend without a single test for the life of the product |
| 4 | Kill criterion | The frontend suite runs longer than 30 seconds, or its tests become plumbing around mocks rather than assertions about what a person sees. Measured at 1.8 seconds for three tests on 2026-08-23 22:02 +0200 |
| 5 | Signal | The count of frontend behaviours in a plan document that have a test that can fail. Three today, all in `docs/plans/retrieval-in-the-hub.md` |

## 4. Why Vitest, and why not Jest

The reasoning of `docs/adr/005-client-test-runner.md` section 4 transfers without change: the Hub's
frontend is a Vite application, so Vitest reuses the same plugin chain and module resolution the
application is built with, while Jest would need a second transform configuration of the same thing.
The Hub's backend keeps Jest for the same reason the search repository's server does, that it works
and nothing triggered a change.

One difference is recorded rather than left to be discovered. The Hub's frontend has no test setup
file, so Testing Library's automatic cleanup is not installed and two renders in one file collide.
The suite calls `cleanup` in `afterEach` explicitly. It was found by the failure it causes, `Found
multiple elements with the text of: Search query`, at 2026-08-23 22:00:49 +0200.

## 5. Behaviours

Not applicable. This ADR records a decision. The behaviours it enables belong to
`docs/plans/retrieval-in-the-hub.md`.

## 6. Definition of done

- `npm test` runs in `frontend` and fails when a behaviour of the search screen breaks.
- The three tests of the search screen pass.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| The runner slows the loop | It is one dev dependency and one config file. Remove both, the application is untouched | minutes |
| Tests turn into mock plumbing | That is the kill criterion of question 4, and it is answered by deleting those tests rather than the runner | not applicable |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the frontend suite joins one command that gates both workspaces | The first time a change breaks one suite while the other is green |
| Whether recommendations 5 and 6 of the review are now checkable | The next session that opens the articles screen with this runner in place |
