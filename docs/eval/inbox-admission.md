# Inbox admission, measured

Append only. See `../standards/EVALUATION_STANDARD.md`.

## Run 2026-08-13 09:10, split `dev`

Commit `fba115b`, model MiniLM through `src/search-engine.js`, 63 intent and item pairs from 21 items and 3 intents.

### Admission at each threshold

| Threshold | Precision | Recall | F1 | Admitted | Dirt admitted | Missed |
|---|---|---|---|---|---|---|
| 0.30 | 63% | 100% | 77% | 19 | 4 | 0 |
| 0.35 | 63% | 100% | 77% | 19 | 4 | 0 |
| 0.40 | 63% | 100% | 77% | 19 | 4 | 0 |
| 0.45 | 67% | 100% | 80% | 18 | 3 | 0 |
| 0.50 | 71% | 100% | 83% | 17 | 3 | 0 |
| 0.55 | 71% | 83% | 77% | 14 | 3 | 2 |
| 0.60 | 73% | 67% | 70% | 11 | 2 | 4 |
| 0.65 | 78% | 58% | 67% | 9 | 1 | 5 |

### Similarity by category, item against its own intent

| Category | Items | Min | Mean | Max |
|---|---|---|---|---|
| exact | 6 | 0.630 | 0.766 | 0.890 |
| duplicate | 3 | 0.578 | 0.761 | 0.892 |
| spam | 3 | 0.440 | 0.597 | 0.704 |
| partial | 3 | 0.466 | 0.556 | 0.690 |
| semantic | 3 | 0.535 | 0.547 | 0.558 |
| trap | 3 | 0.171 | 0.332 | 0.566 |

### Named failures at the production threshold

- admitted dirt: "RUST ASYNC TOKIO best rust async tutorial 2026 rust async" (spam) for intent `rust-async` at 0.704
- admitted dirt: "REACT JOBS react developer jobs react remote jobs hiring now react" (spam) for intent `frontend-role` at 0.646
- admitted dirt: "Sourdough starter cultures in microbiology teaching" (trap) for intent `sourdough` at 0.566
- admitted dirt: "SOURDOUGH RECIPE best sourdough bread recipe sourdough starter buy" (spam) for intent `sourdough` at 0.440

Nothing relevant was missed.

## Run 2026-08-13 09:12, split `dev`

Commit `fba115b-junkfilter`, model MiniLM through `src/search-engine.js`, 54 intent and item pairs from 18 items and 3 intents. Pre filter dropped 3 items before embedding.

### Admission at each threshold

| Threshold | Precision | Recall | F1 | Admitted | Dirt admitted | Missed |
|---|---|---|---|---|---|---|
| 0.30 | 75% | 100% | 86% | 16 | 1 | 0 |
| 0.35 | 75% | 100% | 86% | 16 | 1 | 0 |
| 0.40 | 75% | 100% | 86% | 16 | 1 | 0 |
| 0.45 | 75% | 100% | 86% | 16 | 1 | 0 |
| 0.50 | 80% | 100% | 89% | 15 | 1 | 0 |
| 0.55 | 83% | 83% | 83% | 12 | 1 | 2 |
| 0.60 | 89% | 67% | 76% | 9 | 0 | 4 |
| 0.65 | 88% | 58% | 70% | 8 | 0 | 5 |

### Similarity by category, item against its own intent

| Category | Items | Min | Mean | Max |
|---|---|---|---|---|
| exact | 6 | 0.630 | 0.766 | 0.890 |
| duplicate | 3 | 0.578 | 0.761 | 0.892 |
| partial | 3 | 0.466 | 0.556 | 0.690 |
| semantic | 3 | 0.535 | 0.547 | 0.558 |
| trap | 3 | 0.171 | 0.332 | 0.566 |

### Named failures at the production threshold

- admitted dirt: "Sourdough starter cultures in microbiology teaching" (trap) for intent `sourdough` at 0.566

Nothing relevant was missed.

## Run 2026-08-13 09:13, split `locked`

Commit `fba115b-junkfilter`, model MiniLM through `src/search-engine.js`, 45 intent and item pairs from 15 items and 3 intents. Pre filter dropped 0 items before embedding.

### Admission at each threshold

| Threshold | Precision | Recall | F1 | Admitted | Dirt admitted | Missed |
|---|---|---|---|---|---|---|
| 0.30 | 50% | 100% | 67% | 12 | 3 | 0 |
| 0.35 | 50% | 100% | 67% | 12 | 3 | 0 |
| 0.40 | 45% | 83% | 59% | 11 | 3 | 1 |
| 0.45 | 56% | 83% | 67% | 9 | 3 | 1 |
| 0.50 | 50% | 67% | 57% | 8 | 3 | 2 |
| 0.55 | 50% | 50% | 50% | 6 | 2 | 3 |
| 0.60 | 60% | 50% | 55% | 5 | 1 | 3 |
| 0.65 | 50% | 33% | 40% | 4 | 1 | 4 |

### Similarity by category, item against its own intent

| Category | Items | Min | Mean | Max |
|---|---|---|---|---|
| exact | 3 | 0.467 | 0.637 | 0.761 |
| thin | 3 | 0.536 | 0.625 | 0.741 |
| semantic | 3 | 0.357 | 0.509 | 0.644 |
| partial | 3 | 0.412 | 0.501 | 0.652 |
| trap | 3 | 0.138 | 0.192 | 0.270 |

### Named failures at the production threshold

- admitted dirt: "Rust async" (thin) for intent `rust-async` at 0.741
- admitted dirt: "Frontend job" (thin) for intent `frontend-role` at 0.536
- admitted dirt: "Sourdough" (thin) for intent `sourdough` at 0.599

Nothing relevant was missed.

## Reading of the three runs above, 2026-08-13

What the junk filter did, measured on the dev half at the production threshold of 0.35:

| | Before | After |
|---|---|---|
| Precision | 63% | 75% |
| Recall | 100% | 100% |
| Dirt admitted | 4 | 1 |

All three spam items were dropped before the embedding step, and nothing relevant was lost. That
part worked as the plan said it would.

The locked half then said something the dev half could not: precision there is 50 percent, not 75.
The reason is not that the filter failed. It is that the two halves contain different dirt. Every
spam item sits in dev and every thin item sits in locked, so the dev half could not reveal the
failure the locked half found, and the locked half could not confirm the fix the dev half measured.

The failure the locked half found is worth more than the improvement:

| Category | Mean similarity to its own intent, locked |
|---|---|
| exact | 0.637 |
| thin | 0.625 |
| semantic | 0.509 |

A title with almost no body scores about as high as a real article, and higher than a genuine
semantic match. "Rust async. Read more on our site." reaches 0.741. This makes sense once stated: a
bare title is pure topic with nothing to dilute it, so it sits very close to an intent that is also
pure topic. It is the exact shape of the link posts that fill an aggregator.

Two defects follow, and both are recorded rather than fixed here, because fixing them against these
numbers would spend the held out half.

1. Thin content is admitted. The current pre filter only measures character length, and 48
   characters of pure topic passes it. A rule about how much distinct body a post carries is needed.
2. The split is not stratified. Categories must be spread across dev and locked, otherwise each half
   measures a different product. This is a defect in the answer key, not in the system, and it is
   fixed in its own commit, before any further tuning, per the evaluation standard section 4.

The honest summary of where quality stands: the pipeline behaves correctly on the cases it was
designed for, the free junk rule removes keyword stuffing at no cost to recall, and the inbox still
admits roughly one unwanted item in four on dev and one in two on locked. Nothing here says anything
yet about real feeds.
