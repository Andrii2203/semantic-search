# Style

Status: active
Owner: repository owner
Last change: 2026-08-12

## 1. Problem

Text and code in this repository were written by several hands and several tools, in several
registers. Rules below remove the choices that do not matter so that the ones that do stay visible.

## 2. Text, in every document and every message

| Rule | Instead |
|---|---|
| No em dashes | A comma, a colon, or two sentences |
| No asterisk bold | Plain wording, a heading, or a table |
| No emoji in documents, none in source | A word, or an SVG icon in the UI |
| No version numbers in file names | The header block carries status and date |

Write in short declarative sentences. Prefer a table to a list when the items share fields, prefer a
list to a paragraph when order does not matter.

## 3. Source code

No comments. This is absolute for new and modified code.

The reasoning: a comment is a claim about the code that nothing verifies. It drifts, and a wrong
comment is worse than no comment. Everything a comment would have said has a better home.

| What the comment would have said | Where it goes instead |
|---|---|
| What this function does | The function name, and the document that owns the module |
| Why this value, why this order | The ADR that decided it |
| What this block does | A named function containing that block |
| What is still missing here | The deferred entry in the decision protocol |
| A section divider | Smaller files |

Two consequences follow, and they are the point of the rule.

- Names carry the meaning. `isNearDuplicate`, `matchThreshold`, `recentCorpusVectors`. If a name needs
  a comment, the name is wrong.
- Functions stay small enough to be read in one look. See `COMPLEXITY.md` for the enforced limits.

Exceptions, and there are only three, each one a machine instruction rather than prose:

- The license or shebang line at the top of a file, if one is ever required.
- `eslint-disable` with the rule name, when a rule is genuinely wrong for one line.
- `istanbul ignore` in the three places `TESTING_STANDARD.md` section 7 permits.

JSDoc blocks are comments. They are removed with the rest.

## 4. Naming

- Files in `src/` are kebab case: `search-engine.js`, `health-checker.js`.
- Test files mirror the source path exactly, see `TESTING_STANDARD.md` section 5.
- Functions are verbs, values are nouns, booleans read as a predicate: `hasKeywords`, `isRunning`.
- No abbreviations that a reader would have to expand: `vector` not `vec`, `request` not `req`, except
  where a framework convention already fixed it, as in Express handler signatures.

## 5. Behaviours

Not applicable. Style is enforced by the linter and by review, not by the test suite.

## 6. Definition of done

- `npm run lint` is green, and the no comment rule is checked in review of the diff.
- No document added under `docs/` contains an em dash or asterisk bold.
