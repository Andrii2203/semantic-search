# Complexity limits

Status: active
Owner: repository owner
Last change: 2026-08-12

## 1. Problem

Complexity is where defects hide, and it grows one branch at a time, so no single commit ever looks
wrong. Two functions in this repository had reached 32 branches and 189 lines before anyone noticed,
and both sit on the main path of the product: the search route and the upload route. Since source
files carry no comments (`STYLE.md`), a function that cannot be read in one look cannot be read at
all. The limits below are measured by the linter on every run, so the growth is caught the day it
happens rather than at the next review.

## 2. The two measures

Cyclomatic complexity counts the independent paths through a function: every `if`, `else if`, `case`,
`&&`, `||`, `?:`, loop and `catch` adds one. It answers how many tests are needed to cover the
function.

Cognitive complexity counts how hard the function is for a person to follow. Nesting costs more the
deeper it goes, a chain of `else if` at one level costs little, and a `switch` counts once rather than
once per branch. It answers whether a person can hold the function in their head.

They disagree on purpose, and both are enforced. A flat function with fifteen simple branches is fine
for a reader and hard to test. A function with four branches nested four deep is the opposite.

## 3. Limits

| Rule | Limit | Meaning |
|---|---|---|
| `complexity` | 10 | Cyclomatic paths per function |
| `sonarjs/cognitive-complexity` | 15 | Reading effort per function |
| `max-depth` | 3 | Nested blocks inside a function |
| `max-lines-per-function` | 60 | Body length, blank lines and comments excluded |
| `max-params` | 4 | More than four means the arguments are an object |
| `max-nested-callbacks` | 3 | Callback pyramids |
| `max-statements` | 25 | Statements per function |

Where they run: locally through `npm run lint`, and in CI through `npm run verify`, which is the same
command. There is no separate quality job and no external service, because a gate that lives
somewhere else is a gate that gets ignored.

## 4. What to do when a limit is hit

In order of preference.

1. Extract a named function. Most violations are one loop body or one branch group that already has a
   name in the author's head. Give it that name. This also serves `STYLE.md`, since the extracted
   name replaces the comment that would have introduced the block.
2. Replace nesting with early returns. A guard clause at the top removes one level of depth and one
   path from every line below it.
3. Replace a branch chain with a lookup table or a map of handlers, when the branches differ only in
   data.
4. Split the function along its seams. A route handler that validates, retrieves, fuses and formats is
   four functions and one line of orchestration.

Raising the limit is not on the list. The limits are the same for every file, and changing one is a
decision that runs through `DECISION_PROTOCOL.md` and lands in an ADR.

## 5. The debt list

The files below exceeded the limits before these limits existed. They are listed in `.eslintrc.json`
under `overrides`, where the two complexity rules are turned off for them. Nothing else in the
repository is exempt, so new code cannot add to this list by accident.

| File | Why it is here |
|---|---|
| `src/db.js` | `getItemsPage` builds a query from six optional filters |
| `src/search-engine.js` | `mmrSelect` and `groupByParent` carry the ranking maths |
| `src/chunker/semantic.js` | Sentence grouping loop |
| `src/chunker/utils.js` | `mergeSmallChunks` |
| `src/parsers/experience-parser.js` | Date range parsing and interval merging |
| `src/parsers/ir-builder.js` | Assembles one object from every parser |
| `src/parsers/section-detector.js` | Heading detection heuristics |
| `src/routes/settings.js` | `validateSetting` branches per setting type |

Two rules govern this list.

- It only shrinks. Removing a file from it is a normal refactor and needs no permission.
- Adding a file to it requires an ADR that passes the proof of need, and the answer is expected to be
  no. The alternative is always available: split the function.

Each entry is removed by the change that next touches that file for another reason. Refactoring for
its own sake competes with everything else and loses, refactoring on the way past is nearly free.

## 6. Behaviours

Not applicable. This document configures the linter, it does not change the running system.

## 7. Definition of done

- `npm run verify` fails on a function that exceeds any limit in section 3, outside the debt list.
- CI runs the same command on Node 18 and Node 20.
- The debt list in section 5 matches the `overrides` block in `.eslintrc.json` exactly.
