# The article body cap

Status: active
Owner: repository owner
Last change: 2026-08-18 15:39:55 +0200
Supersedes: none

## 1. Problem

The product keeps the first 2000 characters of an article and discards the rest, at ingest, before
anything else in the system sees it.

`src/sources/rss.js` line 10 declares `MAX_BODY_LENGTH = 2000` and line 13 slices the body to it. The
number is a literal in a source file, so by the rule
`docs/reference/search-constants.md` section 2 states, it has no origin and cannot have one, because
`docs/standards/STYLE.md` forbids explaining it in a comment.

What it costs was measured at 2026-08-18 15:20 +0200 against this project's own article corpus,
`eval/snapshots/2026-08-13/corpus.json`, which holds 2509 Guardian articles fetched outside the RSS
path and therefore not subject to the cap.

| Measure | Characters |
|---|---|
| p10 | 2605 |
| median | 4128 |
| p90 | 8434 |
| longest | 66890 |

2380 of 2509 articles, being 95 percent, are longer than the cap. Of a median article the cap keeps
48 percent. So the product searches roughly half of a typical article, and the half it drops is the
end, where an article usually says what happened.

This is not the truncation defect axis F is measuring. That one is the encoder's 256 token window,
which cuts each chunk. This one happens earlier, at the network boundary, and no later stage can
recover the text because it was never stored. It also cuts mid sentence, since a character count
knows nothing about words.

Two more literals belong to the same fact. `src/explainer.js` line 24 slices the document it shows the
language model at its own 2000, unnamed. And `judgeArticleChars` in `src/search-constants.js` carries
the justification "Matches `MAX_BODY_LENGTH` in `src/sources/rss.js`, so the judge sees exactly what
the system indexes", which is a claim about a number the judge cannot see and will stop being true the
moment either one moves.

## 2. Decision

The cap stays, becomes a named constant with a recorded origin, and is raised until it stops being a
decision about content and becomes a guard against a malformed feed. The judge's budget stops claiming
to match it, and the explainer's literal is named.

The cap is not deleted. A feed can return a whole HTML page with navigation, boilerplate and comments,
and an unbounded body means an unbounded number of chunks and an unbounded embedding cost for one
item in one cycle. A bound that no real article reaches costs nothing and still stops that.

Proof of need: `docs/standards/DECISION_PROTOCOL.md` section 2 exempts defect fixes. A number that
discards half of every article, written as a literal with no origin, is a defect on both counts.

## 3. Scope

In scope:
- `articleBodyChars` in `src/search-constants.js`, with a row in `docs/reference/search-constants.md`.
- `src/sources/rss.js` reading it.
- `explainerDocumentChars` and `explainerQueryChars` for the two literals in `src/explainer.js`.
- The justification of `judgeArticleChars`, rewritten to stop referring to the ingest cap.

Out of scope, each with its reason:
- Raising `judgeArticleChars`, because the answer key in `eval/judgments.json` was produced at 2000
  and raising it would require a re-judging pass, which costs money and a new calibration. It is
  recorded as an open question with its trigger instead.
- Re-ingesting the items already stored under the old cap. They keep the text they were saved with,
  and a mixed corpus is visible rather than hidden, because every item carries its fetch time.
- Fetching the linked article body when a feed carries only a summary. That question was answered for
  the product on 2026-08-16 in `docs/plans/retrieval-quality.md` section 12: RSS carries bodies and no
  scraper is added.
- Stripping boilerplate, navigation and comment sections from a body. It is a content quality
  question, it belongs to axis C, and doing it here would hide what the cap change actually did.

## 4. The value, and why this one

`articleBodyChars` is 100000, and its origin is arbitrary, bounded by a measurement.

The longest article in the corpus above is 66890 characters. 100000 is above every article this
project has ever seen, so no real article is cut, which is the whole point of the change. It still
bounds the pathological case at roughly 17000 words, or about 57 chunks for one item.

The trigger that forces a better number is written with it: an item is actually truncated at this cap.
If that fires, the cap has stopped being a guard and has become a decision about content again, and it
gets measured rather than guessed.

## 5. Behaviours

1. A body longer than `articleBodyChars` is stored cut to exactly that length, and a body shorter than
   it is stored whole.
2. An article of median length, being 4128 characters, is stored whole, which is the defect this
   change exists to close.
3. The explainer sends the language model at most `explainerDocumentChars` of the document and at most
   `explainerQueryChars` of the query.
4. The body is truncated at `articleBodyChars` in `src/sources/rss.js`, and no literal truncates a
   body anywhere in that file.

## 6. Tests

| # | Level | File |
|---|---|---|
| 1 | L4 | `__tests__/sources/rss.test.js` |
| 2 | L4 | `__tests__/sources/rss.test.js` |
| 3 | L2 | `__tests__/explainer.test.js` |
| 4 | L1 | `__tests__/sources/rss.test.js` |

`src/explainer.js` joins the retrieval path list in `eslint.config.js`, so its numbers are governed by
behaviour 4 of `docs/reference/search-constants.md` from now on. Turning the rule on there found two
more, `explainerMaxTokens` and `explainerTemperature`, and they are named rather than exempted. That
makes the explanation call the fourth language model call in this repository configured inline, after
the three phase 2 found.

`src/sources/rss.js` is deliberately not added to that list. It carries operational numbers as well,
being the retry count, the retry delay and the length of the identifier hash, and
`docs/reference/search-constants.md` section 3 puts operational limits out of scope for that document
on the ground that changing them cannot change a ranking. Forcing them into it to satisfy a lint rule
would put numbers in the constants module that the module says do not belong there. Behaviour 4 is
therefore checked by reading the file for a literal truncation instead, which is the property that
actually matters.

The check was narrowed once, at 2026-08-18 15:58 +0200, and the reason is worth keeping. Written as
"no literal slice anywhere in the file" it failed on `slice(0, 16)`, which cuts the identifier hash
and has nothing to do with article length. Naming that 16 to satisfy the check would have put an
identifier format into a module about retrieval numbers, so the check now names the body instead of
the operation.

## 7. Definition of done

- Every behaviour in section 5 has a passing test.
- `npm run verify` is green.
- `docs/reference/search-constants.md` carries a row for every new name, and the row for
  `judgeArticleChars` no longer claims to match the ingest cap.
- A live ingest cycle stores at least one article longer than 2000 characters, checked by hand,
  because no test can prove the network path end to end.

## 8. Rollback

| If | Action | Time |
|---|---|---|
| A feed returns pages instead of articles and the cycle slows | Lower `articleBodyChars`. It is one number in one module now | 2 minutes |
| Long items produce so many chunks that a cycle stops finishing | The measurement to take is chunks per item per cycle, which the scheduler already logs as `chunked`. Lower the cap or bound chunks per item | 1 hour |
| Retrieval quality falls because long articles now dominate BM25 length normalisation | `bm25B` is the parameter that governs it and it is already a named constant. Measured on the local bench, not guessed | 1 hour |

## 9. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether `judgeArticleChars` rises to match what is now indexed, given that a judgment made on the first 2000 characters of a 40000 character article grades a fragment | A re-judging pass is funded, or a report is found to disagree with a hand check because of it |
| Whether items stored under the old cap are re-fetched, so that the corpus stops being a mixture | The local bench is rebuilt, or a measurement is found to depend on body length |
| Whether BM25 length normalisation needs revisiting once documents are five times longer | The local bench shows long articles crowding out short ones |
