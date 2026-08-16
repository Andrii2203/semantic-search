# ADR-015: A vertical ships with a starting base, and the person's feedback builds a second one

Status: accepted
Owner: repository owner
Last change: 2026-08-16 17:40:55 +0200
Supersedes: none

## 1. Problem

A new account is empty and stays empty until the person does work.

Since `docs/adr/010-sources-narrowed-to-user-feeds.md`, a new account has no sources, so the first
cycle fetches nothing and the inbox shows only the welcome items. Before that change the account had
three sources nobody chose. Neither is a start.

The second half of the same problem is the profile. Even with feeds added, the vector begins from the
person's own intent text and nothing else, so the first days of matching are the weakest the system
will ever be, exactly when a person decides whether to keep using it.

`docs/product/COMPETITORS.md` section 4 records what the alternative looks like: Feedly sells
pre-trained models per subject area, so their user is useful on day one. This project asks its user to
build the instrument before it plays.

## 2. Decision

A vertical ships with a base, and the person's use builds a second layer on top of it.

The base is what everyone in that vertical starts from: a set of feeds, a starting profile for the
subject, and the answer key that proved the configuration. It is made once, by us, and it is the same
for every account that opens that vertical.

The second layer is per person and starts empty. Every star, approve and skip moves that person's own
copy of the profile away from the base and toward what they actually read. The base is never
modified by one person's actions.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | Measured 2026-08-16 11:00 +0200: a new account created after ADR-010 has zero sources and an empty inbox until the person adds a feed by hand. `docs/adr/010-sources-narrowed-to-user-feeds.md` section 9 left this as its first open question |
| 2 | Cost of not doing it | The product is judged on its worst day. A person meets an empty screen and a form, and the engine's quality is invisible until they have done the work of assembling a corpus |
| 3 | Cheapest alternative | A single global starter feed list with no subject and no profile. Rejected because it is the same list for a medical analyst and a finance one, which is the generic filter this project cannot win at |
| 4 | Kill criterion | People who start from a base end up with the same inbox quality as people who started empty, measured after both have given a hundred actions. The base is then decoration |
| 5 | Signal | Time from account creation to the first starred item, and the count of actions before the inbox stops changing |

## 4. What a vertical is, now that it has parts

`docs/plans/retrieval-quality.md` section 13 defined a vertical as a configuration plus an answer key.
This ADR adds the two shipping parts, so the whole is four things.

| Part | Made by | Per person | Purpose |
|---|---|---|---|
| Feed set | us, once | shared | So the corpus exists before the person does anything |
| Starting profile | us, once | shared | So the first cycle already sorts, rather than admitting everything or nothing |
| Answer key | us, once | shared | So the configuration was chosen by measurement, and so quality can be proved to a buyer |
| Personal profile | the person's actions | private | So the inbox becomes theirs rather than the vertical's average |

The base is the same for everyone and the divergence is the product. That is the opposite of the
competitor shape recorded in `docs/product/COMPETITORS.md` section 4, where one model trained on
everyone's data serves everyone, and it is the reason this system can serve an interest that no
crowd shares.

## 5. Why the two bases never merge

One person's feedback never changes the shipped base. Three reasons, and the first is enough.

A base modified by its users becomes a model trained on everyone, which is the competitor's product
and needs their scale to work. At this scale it would mean a handful of people's clicks steering
everybody's starting point.

The base is an artefact with a measurement attached: it was chosen against an answer key, and that
number is what a vertical is sold on. A base that drifts silently invalidates its own report.

And a base that changes is not reproducible, so two accounts opened a month apart would start from
different places with no record of the difference.

If the base should ever change, it changes the way any other artefact does: deliberately, in a commit,
re-measured against the answer key.

## 6. Trade-offs

What this costs: a vertical stops being a configuration file and becomes a curated thing. Feeds go
stale, a starting profile encodes somebody's guess about the subject, and `docs/plans/retrieval-quality.md`
section 13 already warns that six verticals means six of everything to keep fresh.

What it buys: the person is useful on day one, and the system has something to measure them against.
A personal profile that has diverged from its base is a measurable fact, and the distance is the
clearest signal this product can collect about whether it is learning anything.

The honest risk, recorded rather than argued away: a base that is good enough may stop people from
ever correcting it, so the personal layer stays empty and every account behaves identically. That is
the kill criterion in section 3 and it is checked rather than assumed.

## 7. Behaviours

1. Opening a vertical creates its feeds for that person without them typing a URL.
2. Opening a vertical creates a personal profile seeded from the vertical's starting profile.
3. The first cycle after opening a vertical admits items, so the inbox is not empty.
4. Feedback moves the person's own profile and never the vertical's starting profile.
5. Two accounts that open the same vertical on different days start from the same base.
6. A person can still add feeds and profiles of their own next to the ones the vertical brought.

## 8. Tests

| # | Level | File |
|---|---|---|
| 1 | L3 | `__tests__/routes/verticals.test.js` |
| 2 | L3 | `__tests__/routes/verticals.test.js` |
| 3 | L2 | `__tests__/scheduler.test.js` |
| 4 | L2 | `__tests__/feedback.test.js` |
| 5 | L1 | `__tests__/verticals.test.js` |
| 6 | L3 | `__tests__/routes/sources.test.js` |

## 9. Definition of done

- Every behaviour in section 7 has a passing test.
- One vertical exists end to end, with its feeds, its starting profile and its answer key, and a fresh
  account that opens it receives a non empty inbox on the first cycle.
- The starting profile of that vertical is recorded as an artefact in git, not generated at runtime.
- `npm run verify` is green.

## 10. Rollback

| If | Action | Time |
|---|---|---|
| A vertical's feeds go stale or die | They are ordinary `user_sources` rows, replaced by editing the vertical definition. No code | minutes |
| The starting profile is wrong for the subject | It is one committed vector with an answer key next to it, so it is re-made and re-measured | hours |
| People ignore the base and build their own anyway | That is the kill criterion, and the base becomes a first feed list without a starting profile | not applicable |

## 11. Open questions

| Question | Trigger that forces an answer |
|---|---|
| How the starting profile is produced: written by hand as intent text, or averaged from items graded relevant in that vertical's answer key | The first vertical is built |
| Whether a person sees which items came from the base and which from their own drift | A person asks why an item appeared |
| Whether the distance between a personal profile and its base is shown to the person or only measured by us | The first hundred actions exist on one account |
| Which vertical is built first | `docs/plans/evaluation-corpus.md` section 4.1 aligns the corpus with the public collections, so the candidates are science, finance and medicine |
