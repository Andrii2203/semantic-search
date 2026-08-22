# Analysis in industry

Status: active
Owner: repository owner
Last change: 2026-08-21 13:28:33 +0200
Supersedes: none

## 1. Problem

The product is about to grow a third layer, and it is the only one with no written standard behind
it.

The first layer, the Hub, was built to the rules of the event that commissioned it, and those rules
are in `docs/archive/misc/requirements-sketches/News Intelligence Hub.md`. The second layer,
retrieval, stands on what the retrieval field publishes, recorded in
`docs/reference/retrieval-in-industry.md`, and every number it uses carries an origin in
`docs/reference/search-constants.md`.

The third layer is the one that turns articles and releases into a judgement about a currency. It
has no such document. Without one it will be invented at the desk, which is how a system acquires
numbers nobody can defend, and this repository has spent two months removing exactly that kind of
number.

## 2. Decision

This document records what the field already publishes about turning news and macro data into a
statement about a currency, with a source and the moment it was read. It is a survey, not a design.
Anything built on it says which method it borrowed, the way the retrieval constants do.

Proof of need: not applicable in the sense of `docs/standards/DECISION_PROTOCOL.md`, because this
adds no feature. It is the survey that a later decision cites, in the shape
`docs/plans/phase-status-audit.md` already used.

## 3. Scope

In scope:
- How the field decides whether an event moved a price at all.
- How a data release is turned into a number that means something for a currency.
- How a policy decision is separated from everything else that happens around it.
- How the text of a central bank becomes a measurable stance.
- What each of those needs as input, and whether that input is free.

Out of scope, each with its reason:
- Trading signals, position sizing and risk. They answer a different question and carry a different
  standard of proof.
- Price prediction. Nothing here claims that a measured past reaction predicts a future one.
- Anything that requires a licensed market data feed this project does not have.

## 4. The four methods

## 4.1 Event study, for deciding whether an event mattered

The standard method for asking whether an announcement moved a price, formalised by MacKinlay in
1997 and used in finance since. An estimation window before the event fixes what normal behaviour
looks like, a narrow event window around the announcement measures what actually happened, and the
difference is the abnormal return. If the event carried no information, the abnormal return is
indistinguishable from zero.

Two rules travel with it. The estimation window must not overlap the event window, or the benchmark
is contaminated by the thing being measured. And the windows are fixed before the data is looked at,
not after.

What it gives this project: a definition of important that is neither a guess nor a threshold
somebody picked. Read at https://www.eventstudytools.com/introduction-event-study-methodology on
2026-08-21 13:20 +0200.

## 4.2 Surprise against consensus, for reading a data release

A release on its own says nothing about a currency. What moves a currency is the distance between
the release and what the market expected.

The Citi Economic Surprise Index is built exactly that way: the weighted difference between actual
releases and the median forecast of an economist survey, expressed in standard deviations, in a
rolling three month window, with a decay so that older surprises fade. The detail that matters most
is how the weights are chosen. They are derived from the measured reaction of the spot exchange rate
to a one standard deviation surprise in each indicator.

So the field has already measured which releases matter to a currency and by how much, and turned it
into a formula. A positive index means data is beating expectations, a negative one means it is
missing them, and the series is known to mean revert rather than trend.

What it gives this project: the shape of a useful line in a daily note. Not that inflation came in
at 3.2 percent, but that it came in above expectations by a stated distance, on an indicator that
carries a known weight for this pair. Read at
https://en.macromicro.me/charts/55674/us-citi-surprise-index-earnings-revision and
https://globalinvesting.github.io/guide-economic-surprises.html on 2026-08-21 13:22 +0200.

## 4.3 High frequency identification, for isolating a policy decision

For central bank decisions the field does not read the text to decide what was new. It reads the
price of interest rate futures in a window of roughly thirty minutes around the announcement and
calls the change the policy surprise. The line runs from Kuttner in 2001 through Gurkaynak, Sack and
Swanson in 2005 to Nakamura and Steinsson in 2018, and is still being refined.

Two findings travel with it. A decision carries more than one signal, the rate itself and what the
central bank has revealed about its own view of the economy, which the literature calls the
information effect and which makes naive readings wrong. And the width of the window is a decision
in itself, because wide windows collect everything else that happened that afternoon.

What it gives this project: the window discipline for the historical check, and a warning that one
announcement can move a currency for two different reasons. Read at
https://www.nber.org/system/files/working_papers/w19260/w19260.pdf and
https://www.michaeldbauer.com/files/mps.pdf on 2026-08-21 13:24 +0200.

## 4.4 Central bank tone as a number

Turning statements and speeches into a hawkish or dovish score is an established task with its own
models and its own labelled data. The Bank for International Settlements publishes CB-LMs, language
models trained for central banking. The ECB stance indicator is a continuous measure built from
official statements from 2003 onward. Labelled sentence sets from FOMC statements exist and were
annotated by experts.

Two things are settled in that literature. Classification is done per sentence, into hawkish, dovish
or neutral. And general purpose sentiment tools are the wrong instrument, because financial language
uses ordinary words to mean specific things.

What it gives this project: no reason to invent a tone prompt, and a published series to check our
own output against. Read at https://www.bis.org/publ/work1215.pdf,
https://www.suerf.org/publications/suerf-policy-notes-and-briefs/enhancing-central-bank-communication-domain-specific-language-models/
and https://www.diw.de/documents/publikationen/73/diw_01.c.972687.de/dp2137.pdf on 2026-08-21 13:26
+0200.

## 5. What each method needs as input

| Method | Input it needs | Where it comes from | Free |
|---|---|---|---|
| Event study | Price history of the pair, at the resolution of the event window | MT4 export, Dukascopy, HistData | yes |
| Surprise against consensus | The release, its timestamp, and the consensus forecast | Releases and timestamps are public, consensus forecasts are the hard half | releases yes, consensus mostly no |
| Policy surprise | Interest rate futures around the announcement | A market data source, not a news feed | no, in practice |
| Central bank tone | The statement or speech in full | Central bank sites, which publish complete archives | yes |

This table is the reason the order of work in `docs/plans/finance-vertical.md` starts where it
starts. Three of the four methods run on data this project can get today. The fourth, the consensus
forecast, is a dependency that has to be solved before the most valuable line of a daily note can
exist at all.

## 6. What this changes in the product

- The distillate is organised around expectation rather than around events. What came in against
  expectations, whether the stance moved, and what is genuinely new.
- The historical check uses windows fixed in advance, and an abnormal move rather than a large one.
- Tone is not invented here. It is produced by a domain model or a prompt that is checked against a
  published series.
- The three layers have different jobs. Price answers whether something mattered. Data answers what
  was surprising. Text answers why, and only text needs retrieval and a graph.

## 7. What the field does not settle

- Attribution. That a price moved after an announcement, in a narrow window, is evidence and not
  proof, and the papers above are careful about this in a way that market commentary is not.
- The information effect, which is still argued about in the same papers that measure the surprise.
- News archives. Everything in section 4 assumes the text is available. Historical news at scale is
  either licensed or assembled from open sources with their own coverage gaps.

## 8. Behaviours

Not applicable. This document surveys other people's work and changes nothing in the running system.

## 9. Tests

Not applicable, for the same reason.

## 10. Definition of done

- Every method in section 4 names its primary source and the moment that source was read.
- Every method says what it gives this project, in one line, rather than being recorded for
  interest.
- A method that later steers a number in the code gives that number a row in the document that owns
  it, with this file as the origin.

## 11. Rollback

Not applicable. A survey carries no runtime risk.

## 12. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether a free or affordable source of consensus forecasts exists at the coverage this needs | The daily note reaches the line that compares a release against expectations |
| Whether interest rate futures data is reachable here at all, and what replaces the policy surprise if it is not | The first central bank decision inside a measured period |
| Whether our own stance output agrees with a published stance indicator | The text layer produces its first stance number |
| Which news archive is used for the historical run, and under what licence | The historical run is scheduled |
