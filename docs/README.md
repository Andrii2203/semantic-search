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
| `standards/EVALUATION_STANDARD.md` | How a measurement is made so that it means something |
| `standards/DEPENDENCY_STANDARD.md` | How packages, runtimes and models are kept current |

## product

Why this exists. Changes rarely.

| File | Answers |
|---|---|
| `product/VISION.md` | What is being built and for whom |
| `product/STRATEGY.md` | How this fits the larger picture |
| `product/COMPETITORS.md` | Who else solves this, and what they publish about how |

## plans

What is being built right now. One active plan at a time.

| File | Answers |
|---|---|
| `plans/retrieval-quality.md` | The active plan: why search is poor and the order it is fixed in |
| `plans/evaluation-corpus.md` | The local bench, its judge and its answer key |
| `plans/public-benchmark.md` | The BEIR bench and the control that validates our metrics |
| `plans/dependency-upgrade.md` | The measured state of every dependency and the order they move in |
| `plans/production-readiness-fixes.md` | The defects found by running the system, and their fixes |
| `plans/finance-vertical.md` | The Hub as the single product, and the six phases that give it a measured daily note |
| `plans/retrieval-in-the-hub.md` | Phase 3: chunks, vectors and hybrid search inside the Hub |
| `plans/hub-test-database.md` | Why the Hub's integration suite has a database of its own |

## eval

One report per measurement, appended, never overwritten. Produced under
`standards/EVALUATION_STANDARD.md`.

## adr

One decision per file, numbered, with a status of accepted, rejected, deferred or superseded.
Produced by `standards/DECISION_PROTOCOL.md`.

## reference

Descriptions of parts of the system that outlive any plan.

| File | Covers |
|---|---|
| `reference/system-anatomy.md` | What is connected to what, taken from the import graph |
| `reference/search-constants.md` | Every retrieval number and where it came from |
| `reference/retrieval-in-industry.md` | What eleven production systems publish about retrieval |
| `reference/scheduler.md` | The ingest cycle |
| `reference/resume-parser.md` | PDF to structured resume |
| `reference/living-design.md`, `reference/living-design-tech.md` | The optional third theme, not built |

## archive

Superseded plans, one off reviews, drafts and sketches. Kept so history is not lost, never used as a
source of truth, never edited. See `archive/README.md` for what is in there and why it was retired.
