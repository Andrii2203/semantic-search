# ADR-014: A person has one profile per interest, not one profile

Status: accepted
Owner: repository owner
Last change: 2026-08-16 14:56:45 +0200
Supersedes: docs/adr/002-dynamic-profiles.md, the part that stores one vector per person

## 1. Problem

The profile is one vector per person, and three interests average into a direction that points at
none of them.

The shape is visible in the code rather than inferred. `src/db.js` stores profiles keyed by user,
`src/scheduler.js` loads exactly one vector per user in `loadProfileForUser`, and `src/feedback.js`
blends every action into that single vector: `blended = (1 - |weight|) * current + weight * item`,
then normalises. So a star on a retrieval paper and a star on a job posting pull the same vector in
two directions, and what survives is their mean.

The consequence for a person with three interests is not that matching is worse for one of them. It
is worse for all three, because the vector sits between them, closer to whatever they clicked most
recently. Nothing in the system reports this, because a single vector always produces a cosine and
never says the direction is meaningless.

The same defect appears in the search route, where every query silently overwrites the stored profile
for internet searches, so searching for one subject moves the inbox for every other.

## 2. Decision

A person holds many profiles, one per interest, and each is an independent vector with its own
feedback history. Three interests belong to one person exactly the way three interests belong to
three different people: they never average.

An item entering the inbox is matched against every profile of that person, and it is admitted if it
clears the cutoff for any one of them. The profile that admitted it is stored on the match, so the
inbox can say which interest brought an item and feedback can go back to the right vector.

## 3. Proof of need

Not required. `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes, and averaging
independent interests into one direction is a defect in the representation rather than a feature
somebody wanted. The decision recorded here is the shape of the fix, taken by the repository owner
at 2026-08-16 14:56:45 +0200.

## 4. What this changes

| Place | Today | After |
|---|---|---|
| `profiles` table | one row per user, keyed by `user_id` | many rows per user, each with a name and its own vector |
| `src/scheduler.js` `loadProfileForUser` | returns one vector | returns the set of that person's vectors |
| `src/scheduler.js` `matchUsers` | one cosine per item per person | one cosine per item per profile, admitted on the best |
| `user_matches` | carries `score` | carries `score` and the profile that produced it |
| `src/feedback.js` | blends into the single vector | blends into the profile that admitted the item |
| `src/routes/search.js` | a query overwrites the person's profile | a query either targets a named profile or creates none |
| The inbox | one undifferentiated stream | an item can say which interest it arrived for |

## 5. Trade-offs

What this costs: matching becomes one cosine per profile per item rather than one per person, so a
person with five interests costs five times the comparisons. At the corpus sizes in
`docs/reference/search-constants.md` this is arithmetic over a few thousand 384 dimension vectors and
is not a latency question yet. The trigger that would make it one is recorded in section 9.

What it buys, and it is larger than better matching. It makes the thing measurable. A single vector
cannot be evaluated per interest, because there is only one score and no way to say which interest it
failed. With one profile per interest, the confusion matrix of
`docs/standards/EVALUATION_STANDARD.md` section 5 can be computed per interest, and a person can see
that the engine serves two of their three subjects well.

It also removes the accident where searching moves the inbox. A search either names a profile or
touches none, which is the behaviour a person expects from a search box.

## 6. What it does not change

The vector arithmetic is untouched. `src/feedback.js` keeps the same blend and the same weights of
0.15, 0.10 and minus 0.05, applied to a smaller and more coherent target.

The admission cutoff stays one number, `semanticCutoffInbox`. Whether it needs to be per profile is
an open question below rather than a decision here, because
`docs/adr/011-one-cutoff-one-origin.md` just finished removing a cutoff for existing in two places.

## 7. Behaviours

1. A person can hold more than one profile, each with its own name and vector.
2. A profile belongs to exactly one person and is never visible to another.
3. An item is admitted when it clears the cutoff against any one of that person's profiles.
4. A match records which profile admitted it.
5. Feedback on an item moves the profile that admitted it and no other.
6. Two profiles of the same person that receive opposite feedback move in opposite directions.
7. A search does not overwrite any profile unless it names one.
8. A person with no profiles receives no matches rather than an error.

## 8. Tests

| # | Level | File |
|---|---|---|
| 1 | L2 | `__tests__/profiles-multi.test.js` |
| 2 | L2 | `__tests__/profiles-multi.test.js` |
| 3 | L2 | `__tests__/scheduler.test.js` |
| 4 | L2 | `__tests__/scheduler.test.js` |
| 5 | L2 | `__tests__/feedback.test.js` |
| 6 | L2 | `__tests__/feedback.test.js` |
| 7 | L3 | `__tests__/routes/search.test.js` |
| 8 | L2 | `__tests__/scheduler.test.js` |

Behaviour 6 is the one that proves the decision rather than the plumbing. Under the current single
vector it is impossible to satisfy: two opposite feedbacks on one vector cancel. It fails today for a
reason that is the whole point of this ADR.

## 9. Definition of done

- Every behaviour in section 7 has a passing test.
- A migration carries each existing single profile to a first named profile, so no stored vector is
  lost and no account wakes up empty.
- `npm run verify` is green.
- `docs/adr/002-dynamic-profiles.md` carries status partly superseded, naming this file.

## 10. Rollback

| If | Action | Time |
|---|---|---|
| Matching cost becomes visible in a cycle | Cap the number of profiles per person, which is a constant with a measured trigger rather than a redesign | 1 hour |
| The inbox becomes confusing with several interests mixed | The match carries its profile, so the inbox can group or filter by it without touching retrieval | hours |
| The migration mis-assigns an existing vector | The old row shape is a strict subset, so the migration is reversible by dropping the profile name column | 30 minutes |

## 11. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether the admission cutoff is per profile rather than one number | One interest floods the inbox at a cutoff that starves another, measured on real matches |
| Whether an item admitted by two profiles appears once or twice | The first person with two overlapping interests |
| How a profile is created: by the person naming it, or by splitting an existing one when its feedback pulls in two directions | A person asks for the second one |
| Whether per profile scoring costs enough to matter | A cycle's matching stage exceeds the ingest stage in wall clock |
