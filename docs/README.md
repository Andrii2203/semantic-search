# Documentation map

Start at `CLAUDE.md` in the repository root. This file only says what lives where.

## standards

How work is done here. Read before writing anything.

| File | Answers |
|---|---|
| `standards/WORKFLOW.md` | In what order do I work |
| `standards/TESTING_STANDARD.md` | How is a test written, and when is it worth keeping |
| `standards/DECISION_PROTOCOL.md` | How do I prove something is needed, or prove it is not |
| `standards/DOCUMENT_TEMPLATE.md` | What shape does a new document take |
| `standards/STYLE.md` | How does text and code look here |
| `standards/COMPLEXITY.md` | What are the limits, where are they enforced |
| `standards/DESIGN_STANDARD.md` | Visual language of the UI |

## product

Why this exists. Changes rarely.

| File | Answers |
|---|---|
| `product/VISION.md` | What is being built and for whom |
| `product/STRATEGY.md` | How this fits the larger picture |

## plans

What is being built right now. One active plan at a time.

| File | Answers |
|---|---|
| `plans/PLAN_v7.md` | The phased execution plan |
| `plans/production-readiness-fixes.md` | The defects found by running the system, and their fixes |

## adr

One decision per file, numbered, with a status of accepted, rejected, deferred or superseded.
Produced by `standards/DECISION_PROTOCOL.md`.

## reference

Descriptions of parts of the system that outlive any plan.

| File | Covers |
|---|---|
| `reference/scheduler.md` | The ingest cycle |
| `reference/resume-parser.md` | PDF to structured resume |
| `reference/living-design.md`, `reference/living-design-tech.md` | The optional third theme, not built |

## archive

Superseded plans, one off reviews, drafts and sketches. Kept so history is not lost, never used as a
source of truth, never edited. See `archive/README.md` for what is in there and why it was retired.
