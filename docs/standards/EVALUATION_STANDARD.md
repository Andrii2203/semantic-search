# Evaluation standard

Status: active
Owner: repository owner
Last change: 2026-08-12

## 1. Problem

The whole product is one promise: what reaches the inbox is what the person wanted. Nothing in the
repository measures that. The plan has claimed since June that ranking is verified, and no number was
ever recorded.

There is a worse failure available than not measuring, and it is measuring badly. If the same hand
writes the answer key, reads the score, then adjusts the system until the score improves, the number
goes up and nothing about the product got better. That is the failure this document exists to
prevent.

## 2. The oracle

An oracle is the answer key: for a given intent and a given item, the verdict a person would give.
Relevant, or not. Nothing about the system appears in it. It is a statement about what someone wants,
recorded before the system is asked.

Three properties make an oracle worth having.

It is written from the intent, not from the output. You read the intent text, you read the item, you
decide. If you find yourself thinking "the engine put this at rank two, so it is probably relevant",
the oracle is already contaminated and the measurement is worthless.

It is fixed before the run. Labels are committed to git first. A label changed after seeing a score
is no longer an answer key, it is a rationalisation.

It contains the cases you would rather not see. See section 3.

## 3. Dirty data is mandatory

An answer key made only of relevant documents measures nothing, because a system that returns
everything scores perfectly on it. The interesting question is never "does it find the good ones",
it is "what does it let through".

Every dataset in this repository carries these categories, and a run reports them separately.

| Category | What it is | What it catches |
|---|---|---|
| `relevant` | Plainly what the intent asked for | Basic retrieval |
| `semantic` | Right topic, none of the query words | Whether meaning is used at all, or only keywords |
| `partial` | Adjacent topic, useful to some people, not asked for | Where the boundary sits |
| `irrelevant` | Different topic entirely | Baseline noise |
| `trap` | Query word present, different subject: rust the metal, react the chemical reaction | Keyword matching pretending to be understanding |
| `spam` | Keyword stuffed text with no content | Whether density beats meaning |
| `duplicate` | Near copy of a relevant item | Whether one story fills the inbox |
| `thin` | A title with almost no body | Whether the pre filter and the ranking hold |

A result set with high precision that also carries two traps in the top five is not a good result
set. Reporting a single averaged number hides exactly that, so runs report per category counts.

## 4. Guarding against tuning to the measurement

Every dataset is split in two, and each item declares which half it belongs to.

`dev` is open. Look at it, tune against it, run it as often as you like. Roughly two thirds.

`locked` is closed. It is run when a change is finished, and its numbers go into the report as the
result. You do not tune against it, you do not look at its failures item by item to decide the next
change. Roughly one third.

If the two halves disagree badly, that itself is the finding: the system was fitted to the dev half
and the improvement is not real.

Three more rules, each one earned by a common way of fooling yourself.

Record the configuration with the number. A score without its threshold, ranking mode and model is
not a result, it is a rumour.

Record the failures, not only the score. A report names the items that were wrongly admitted and
wrongly missed. A score with no examples cannot be acted on and cannot be checked by anyone else.

Never edit a label to fix a failing case. If a label is genuinely wrong, correct it in its own commit,
before the run, with the reason written down. Never in the same change as a tuning.

## 5. What the numbers mean

The product makes a binary decision on every item: does it enter this person's inbox. So the primary
measurement is a confusion matrix at the threshold that production actually uses.

| Term | Meaning here |
|---|---|
| True positive | Relevant item admitted |
| False positive | Item admitted that the person did not want, the dirt that reaches the inbox |
| False negative | Relevant item never shown, the loss nobody sees |
| Precision | Of what reached the inbox, how much was wanted |
| Recall | Of what was wanted, how much reached the inbox |
| F1 | The two together, when neither can be sacrificed |

Ranking metrics (precision at k, recall at k, MRR, nDCG) apply to the search screen, where order is
what the person sees. They do not describe the inbox, where the threshold decides.

Precision and recall trade against each other, and the trade is a product decision, not a technical
one. For an inbox that a person reads daily, a false positive costs attention every single time and a
false negative is invisible. That argues for precision. It is written down here so that the choice is
deliberate rather than a side effect of a default.

## 6. What a synthetic dataset can and cannot prove

The dataset in `src/seed.js` is written by us. It proves that ranking behaves as intended on cases we
imagined, including the dirty ones. It is a bench, and a bench catches a broken pipeline, a bad
threshold, a keyword trap that scores too high.

It cannot tell you how the system behaves on real feeds, because real content is messier than
anything we would invent, and we cannot invent the failures we have not thought of.

The real oracle already exists and costs nothing to collect: the person's own actions. Star, approve
and skip are labels on real items, made by the only judge that matters, before any score is computed.
When there are enough of them, the same measurement runs against that, and this synthetic bench goes
back to being a smoke test. Trigger for that work: one hundred logged decisions from one account.

## 7. How a run is done

1. Check that labels are committed and unchanged: the run must be reproducible from git.
2. Run the dev half, look, change the system if you want to.
3. When the change is finished, run the locked half once.
4. Write the report into `docs/eval/`: date, commit, configuration, per category counts, the
   confusion matrix, and the named failures.
5. The report is appended to, never overwritten. Old numbers are how you see whether you improved.
