# Document template

Status: active
Owner: repository owner
Last change: 2026-08-12

## 1. Problem

The repository accumulated thirty documents in six shapes: plans, reviews, notes, articles, sketches.
Nothing said which one was current, which one was superseded, or where a new one belonged. Every
document from now on uses the template in section 3, so that any of them can be read, compared and
retired mechanically.

## 2. Rules

- One template, no variants. If a section does not apply, write `not applicable` and one line why.
  Deleting a section is not allowed, because a missing section is indistinguishable from a forgotten
  one.
- File name: kebab case, no version suffix, no dates in the name. `settings-persistence.md`, not
  `Settings Plan v3 final.md`. Versions live in the header and in git history.
- Location follows the table in `CLAUDE.md` section 3.
- Superseded documents move to `docs/archive/` and get `Status: superseded by <path>` in the header.
  They are never edited afterwards.
- No em dashes, no asterisk bold, per `STYLE.md`.
- The behaviour list in section 4 is the contract with the test suite. Test names repeat those lines
  verbatim, see `TESTING_STANDARD.md` section 8.

## 3. The template

Copy everything between the markers into the new file.

```markdown
# <Title, a noun phrase, no version numbers>

Status: draft | active | superseded by <path>
Owner: <who decides>
Last change: <YYYY-MM-DD>
Supersedes: <path or none>

## 1. Problem

What is wrong or missing today, in observable terms. What breaks, for whom, how often. No solution
here. If this section cannot be written without naming the solution, the problem is not understood
yet.

## 2. Decision

What will exist when this is done, in two or three sentences. The reasoning belongs in the ADR that
this document links to, not here.

Proof of need: <link to the ADR, or the sentence from DECISION_PROTOCOL.md that authorised this>

## 3. Scope

In scope:
- <thing>

Out of scope:
- <thing>, because <reason>

## 4. Behaviours

Numbered, each one true or false about the running system, each one checkable by a machine.
This list is the source of the test names.

1. <subject> <verb> <observable result> when <condition>
2. ...

## 5. Tests

One line per behaviour, in the same order, naming the level from TESTING_STANDARD.md section 3 and
the file the test lives in.

| # | Level | File |
|---|---|---|
| 1 | L3 | `__tests__/routes/<name>.test.js` |

## 6. Definition of done

- Every behaviour in section 4 has a passing test.
- `npm run verify` is green.
- <anything specific to this change that a test cannot express, for example a manual check in Docker>

## 7. Rollback

| If | Action | Time |
|---|---|---|
| <failure mode> | <the exact step back> | <minutes> |

## 8. Open questions

Questions that block nothing today but will need an answer. Each with the trigger that forces the
answer. If there are none, write `none`.
```

## 4. Behaviours

Not applicable. This document defines a format, it does not change the running system.

## 5. Tests

Not applicable, for the same reason. The format is enforced by review, not by the suite.

## 6. Definition of done

- Every document under `docs/standards/`, `docs/plans/`, `docs/product/` and `docs/reference/` carries
  the header block from section 3.
- A new document that does not follow this template is rewritten before it is merged.

## 7. Rollback

Not applicable. A format change carries no runtime risk.

## 8. Open questions

None.
