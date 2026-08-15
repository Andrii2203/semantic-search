# Dependency standard

Status: active
Owner: repository owner
Last change: 2026-08-15 11:10:48 +0200
Supersedes: none

## 1. Problem

Nothing in this repository ever checked whether a dependency was current, and the cost of that is not
hypothetical. Measured on 2026-08-15, the runtime this project builds and tests on, Node 20, reached
end of life on 2026-04-30 and receives no security patches. The linter that enforces
`docs/standards/COMPLEXITY.md` is ESLint 8, whose successor 9 reached end of life on 2026-08-06, nine
days before this was written. Ten runtime dependencies are a major version behind.

The failure this creates is specific and it is worse than being out of date. `docs/plans/retrieval-quality.md`
section 6.1 spent a phase on a build that would not install, and the cause was a native module with no
prebuilt binary for the installed Node version. That is a dependency currency problem that was
diagnosed as an environment problem, and the workaround, a Docker only gate, is now the way this
project runs its tests.

Every measurement, every axis and every conclusion in `docs/eval/` rests on packages nobody checked.

## 2. The rule

A dependency is chosen and kept the same way a constant is: with its origin written down.

1. Before a phase begins, the installed version and the latest published version of every dependency
   are read from the registry, with the moment of the read, and recorded in the plan that carries the
   phase.
2. A dependency a major version behind is a defect with a named trigger, not a preference. Either it
   is upgraded, or the plan records why it is not and what would force it.
3. A runtime or a tool past its end of life date is a defect with no exemption. The date is read from
   the publisher, not from memory.
4. A new package passes `docs/standards/DECISION_PROTOCOL.md` before it is added, and its row records
   the latest version, its licence and its end of life policy at the moment it was adopted.
5. A model, a dataset and a hosted API are dependencies under this rule. The model identifier in
   `src/search-constants.js` carries the same obligation as a package in `package.json`, which
   `docs/adr/007-judge-on-anthropic.md` learned the hard way when a configured model stopped existing.
6. The version a number was measured on is part of the number. A result in `docs/eval/` names the
   model and, when the retrieval path changed underneath it, the versions of the packages that
   produced it.

## 3. What this rule does not say

It does not say upgrade everything on release. A major version behind is a defect that must carry a
reason, and "the upgrade is a rewrite of the linter configuration and it is scheduled for phase 2" is
a reason. An empty cell is not.

It does not say prefer the newest package for a job. `docs/adr/006-user-sources-rss-first.md` section
4 rejected a package for eighty lines of local code and that reasoning stands. Fewer dependencies
kept current beats more dependencies kept fresh.

## 4. Behaviours

1. `npm outdated` output, or an equivalent read of the registry, is recorded in the active plan with
   the moment it was taken.
2. No dependency in `package.json` sits on a major version whose successor has been published for
   more than one phase without a row naming the reason.
3. The Node version in `Dockerfile`, in `engines` and in CI is a release that is not past its end of
   life date.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | not a test | a measurement, recorded in the plan, because it needs the registry |
| 2 | not a test | review of the plan's table against `package.json` |
| 3 | L1 | `__tests__/engines.test.js`, asserting the major version in `engines` matches the one in `Dockerfile` |

Behaviour 3 is the only one a machine can check without a network call, and it catches the specific
way this drifts: a Dockerfile pinned to one major while `engines` allows another.

## 6. Definition of done

- The audit table exists in `docs/plans/dependency-upgrade.md` with a read timestamp.
- Every major behind carries either an upgrade in the order of work or a reason and a trigger.
- The Node version used by every stage of the `Dockerfile` is a supported release.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| An upgrade breaks the suite | The upgrade is one commit per package, so the failing one is identifiable and revertable alone | minutes |
| The registry is unreachable when a phase begins | The phase proceeds and the audit row records that the read failed and when it will be retried. A missing read is written down, never skipped silently | minutes |

## 8. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether this check is automated in CI rather than done by hand per phase | The audit is skipped once |
| Whether a lockfile is committed, given the audit assumes a reproducible install | The same install produces two different trees on two machines |
