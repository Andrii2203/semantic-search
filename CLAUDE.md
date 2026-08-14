# Entry point

This file is the single, permanent entry point for any AI agent or new contributor working in this
repository. It is intentionally short and stable. It states the rules and points to the documents
that hold the detail. Detail changes over time, this file does not.

Read this file first, then the document that matches your task. Never start from a source file.

## 1. What this project is

A universal matching engine. A person writes, in free text, what they care about. The system pulls
content from sources (Hacker News, Reddit, Djinni today, user supplied sources later) or from the
person's own uploaded documents, splits it into chunks, embeds it, and delivers only what matches
that intent into a Gmail style inbox. Every action the person takes (star, approve, skip) nudges
their profile vector, so the match improves over time.

Product intent: `docs/product/VISION.md`, `docs/product/STRATEGY.md`.
Current execution plan: `docs/plans/retrieval-quality.md`.
What production search systems do, and the six axes this plan measures:
`docs/reference/retrieval-in-industry.md`.
Every number in the retrieval path, with its origin: `docs/reference/search-constants.md`.

## 2. Hard rules

These are not preferences. Work that breaks them is rejected and redone.

| # | Rule | Detail |
|---|---|---|
| 1 | Document first, then tests, then code | `docs/standards/WORKFLOW.md` |
| 2 | Tests are never bent to fit existing code | `docs/standards/TESTING_STANDARD.md` |
| 3 | No test exists to raise a number | `docs/standards/TESTING_STANDARD.md` section 2 |
| 4 | Nothing is built without a written proof that it is needed | `docs/standards/DECISION_PROTOCOL.md` |
| 5 | Every new document uses the one template | `docs/standards/DOCUMENT_TEMPLATE.md` |
| 6 | Complexity limits are enforced by the linter and by CI | `docs/standards/COMPLEXITY.md` |
| 7 | No comments in source code | `docs/standards/STYLE.md` |
| 8 | No em dashes, no asterisk bold in any text | `docs/standards/STYLE.md` |

## 3. Where things live

| Path | Contents | Stable? |
|---|---|---|
| `CLAUDE.md` | this file, the entry point | permanent |
| `docs/standards/` | how we work: workflow, testing, decisions, template, style, complexity | rarely changes |
| `docs/product/` | why the product exists: vision, strategy | rarely changes |
| `docs/plans/` | the one active execution plan | changes per phase |
| `docs/adr/` | one decision per file, dated, with status | append only |
| `docs/reference/` | module level descriptions that outlive plans | changes with modules |
| `docs/archive/` | superseded material kept for history only | never used for work |
| `src/` | backend: Express, SQLite, scheduler, search engine | code |
| `client/` | React UI | code |
| `__tests__/` | tests, mirroring the `src/` tree | code |
| `scripts/` | one off operational scripts | code |
| `eval/` | frozen snapshots, chosen intents, the answer key, the calibration set | data, committed |

`docs/archive/` is dead weight by definition. Never cite it as a source of truth, never restore from
it without running the decision protocol first.

## 4. How to start any task

1. Find or write the document that describes the behaviour you are about to change.
   Use `docs/standards/DOCUMENT_TEMPLATE.md`. Put it in the folder from the table above.
2. If the task adds something new, first pass the proof of need in
   `docs/standards/DECISION_PROTOCOL.md` and record the outcome as an ADR.
3. Write the tests from the behaviour list of that document, following
   `docs/standards/TESTING_STANDARD.md`. They must fail for the right reason before any code exists.
4. Write the code until the tests are green. Do not touch the tests while doing this.
5. Run the gate: `npm run verify`. It must be green before you report the task as done.

## 5. Definition of done for any change

- The document exists and its behaviour list matches what the code does.
- Every behaviour in that list has a test, and every test maps to a behaviour.
- `npm run verify` passes: lint, complexity limits, full test suite.
- No comments were added to source files.
- Anything deliberately left undone is written down with its reason and its revisit trigger.
