# ADR-024: The body is fetched from the page, and the feed is only an index

Status: accepted
Owner: repository owner
Last change: 2026-08-24 13:16:20 +0200
Supersedes: none

## 1. Problem

`docs/plans/finance-vertical.md` phase 4 asks for sources with a full body. It does not say where a
body comes from, and the assumption underneath the whole ingest is that a feed carries one.

Measured on 2026-08-24 11:13:46 +0200, by fetching each feed and taking the length of
`content:encoded` or `description` after tags are stripped, over the first twenty items:

| Feed | Items | Median body | Longest | Under 200 characters |
|---|---|---|---|---|
| `https://www.ecb.europa.eu/rss/press.html` | 15 | 0 | 0 | 15 of 15 |
| `https://www.ecb.europa.eu/rss/pub.html` | 15 | 808 | 1927 | 2 of 15 |
| `https://www.federalreserve.gov/feeds/press_all.xml` | 20 | 104 | 254 | 18 of 20 |
| `https://www.federalreserve.gov/feeds/press_monetary.xml` | 15 | 63 | 118 | 15 of 15 |
| `https://www.bls.gov/feed/bls_latest.rss` | 1 | 686 | 686 | 0 of 1 |
| `https://apps.bea.gov/rss/rss.xml` | 47 | 709 | 1106 | 0 of 20 |
| `https://feeds.bbci.co.uk/news/business/rss.xml` | 51 | 102 | 122 | 20 of 20 |

The ECB press feed is the sharpest case. Its item carries `title`, `link`, `guid` and `pubDate` and
nothing else, read at the same moment. `backend/src/workers/feed-pull.worker.ts:95` computes
`item.content || item.description || ''`, so every ECB press release enters the Hub as an empty
string, and `backend/src/pipeline/prefilter.service.ts:27` drops it at 200 characters. The central
bank whose decisions move this pair is, today, unstorable.

This is the same defect the containers already showed from the other side. A BBC feed added on
2026-08-23 produced 38 articles and every one was `pre_filtered`, recorded in
`docs/plans/retrieval-in-the-hub.md` section 9.1.

The page behind the link does carry the body. The same ECB press release, fetched at
2026-08-24 11:14:07 +0200, is 109595 bytes of HTML holding 19380 characters of text once tags are
stripped. The body is in there and so is every navigation label of the site.

## 2. Decision

The feed is an index, not a source of text. When the text a feed carries is below the prefilter
threshold, the linked page is fetched once, its body extracted by Readability over a jsdom
document, and the result stored beside the feed text rather than over it. Everything downstream, the
prefilter, the analysis and the chunker, reads the body when there is one.

Proof of need: section 3.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | Two events that already happened. 38 BBC articles arrived and all 38 were `pre_filtered`, 2026-08-23, `docs/plans/retrieval-in-the-hub.md` section 9.1. And the ECB press feed carries a zero length body on every one of its 15 items, measured 2026-08-24 11:13:46 +0200, so the primary source of this vertical cannot be ingested at all |
| 2 | Cost of not doing it | Phase 5 of `docs/plans/finance-vertical.md`, stance and novelty and the explanation of a move, has nothing to read. Every layer above the ingest is capped at 102 characters of BBC summary, and at zero for the ECB |
| 3 | Cheapest alternative | Lower `PREFILTER_MIN_LENGTH` and keep the summaries. Rejected on a measurement: a 102 character BBC summary is one sentence, and `docs/adr/021-embeddinggemma-truncated-to-384.md` chunks at 200 words. A threshold change admits the item and still gives the retrieval core nothing to chunk. It also cannot help the ECB, whose body is zero characters, not a short one |
| 4 | Kill criterion | Extraction that returns the site chrome rather than the body on the sources this vertical needs, or a fetch step that makes ingest miss its schedule. Both are read from the log line of question 5 and from the length comparison the fetcher already records |
| 5 | Signal | One log line, `body fetched`, carrying the host, the HTTP status, the bytes of HTML, the characters extracted, the characters the feed carried, and the milliseconds. A body that came out shorter than the feed text is visible in that line without opening the database |

## 4. Why Readability over a hand written extractor

The naive route was tried first and it fails in a way that is easy to miss. Stripping every tag from
the ECB press release gives 19380 characters, of which the release itself is a fifth and the rest is
the language selector and the navigation, measured 2026-08-24 11:14:07 +0200. Taking every paragraph
longer than 80 characters gives, on the Fed statement page, a first paragraph reading
`Official websites use .gov`, measured 2026-08-24 11:14:21 +0200. A per source selector would work
and there are four sources today, which is exactly how a per source selector table starts.

Readability over the same pages, measured 2026-08-24 11:16:29 to 11:18:14 +0200:

| Page | HTML bytes | Extracted characters | First words |
|---|---|---|---|
| ECB press release, `ecb.pr260821~a044fdddd9` | 109595 | 5870 | `PRESS RELEASE 21 August 2026 Compared with June 2026` |
| ECB interview, `ecb.in260824~fa5acbddea` | 112668 | 9097 | `Interview with Piero Cipollone, Member of the Executive Board` |
| Fed FOMC statement, `monetary20260729a` | 81206 | 1269 | `July 29, 2026 Federal Reserve issues FOMC statement` |
| BLS Employment Situation, `empsit.nr0` | 63996 | 7731 | `Transmission of material in this news release is embargoed` |
| BBC, `cdeweewjdxno` | 393577 | 3417 | `Fast-fashion giant Shein could see its stock market valuation` |
| BBC, `c8xnxy89gv7o` | 408999 | 4812 | `A review is being launched into the way business rates are calculated` |
| BBC, `cz647wlvg1do` | 399097 | 1528 | `Dray encouraged students to make use of every scholarship` |

Every one of those begins at the body. The BBC number is the one that decides the general case: 3417
characters against the 102 the same article carried in the feed, a factor of 33.

One earlier run of this table reported 0 characters for BBC. That run had followed the channel level
`<link>` of the feed rather than the link of an item, so it extracted the section index. It is
recorded here rather than deleted, because a zero from an extractor and a zero from a wrong URL look
identical in a log.

## 5. Why the DOM is jsdom 26, after linkedom was chosen first and failed

Readability needs a DOM and does not ship one. Three candidates were read from the registry at
2026-08-24 11:17:36 +0200.

| Package | Latest | Licence | Node engines | Direct dependencies |
|---|---|---|---|---|
| `@mozilla/readability` | 0.6.0, published 2025-03-03 | Apache-2.0 | `>=14.0.0` | 0 |
| `jsdom` | 30.0.1, published 2026-07-29 | MIT | `^22.22.2 or ^24.15.0 or >=26.0.0` | 21 |
| `linkedom` | 0.18.13, published 2026-07-07 | ISC | `>=16` | 5 |

This section was written twice and the first version is kept, because the reason it was wrong is the
useful part.

It first chose linkedom, on a measurement: the same four pages extracted through linkedom and through
jsdom 30 at 2026-08-24 11:16:29 and 11:18:14 +0200 gave lengths identical to the character, 5870,
1269, 7731 and 3417, at 5 transitive dependencies against 21. jsdom 30 was ruled out separately
because the images of the Hub are `node:20-slim`, set by `docs/plans/retrieval-in-the-hub.md` section
9.1, and it demands Node 22.22.2 or newer.

linkedom does not run in this product. Measured 2026-08-24 12:26 +0200, when the first extractor test
was executed: linkedom depends on `css-select` 7, which publishes ESM only, and the backend compiles
to CommonJS and runs its suite through ts-jest in CommonJS. The failure is
`SyntaxError: Cannot use import statement outside a module`, raised inside
`node_modules/linkedom/cjs/shared/matches.js`.

jsdom 27.4.0 was tried next, for the same reason it was passed over: it accepts `^20.19.0`. It fails
the same way, through a different package, `@exodus/bytes`, reached from `html-encoding-sniffer`.

jsdom 26.1.0 loads under CommonJS, declares `>=18`, MIT, 20 direct dependencies. Extraction was
measured again rather than assumed, at 2026-08-24 12:49:00 +0200 on the same four pages: 5870, 1269,
7731 and 3417. Four DOM implementations, one number each, all four identical.

It is one major behind the published latest, which `docs/standards/DEPENDENCY_STANDARD.md` rule 2
calls a defect that must carry a reason and a trigger. The reason is the two failures above. The
trigger is the Hub leaving CommonJS, or its images moving to Node 22 or newer.

Cost of the step, measured 2026-08-24 11:18:26 +0200 on this machine: the ECB page took 296
milliseconds to fetch and 36 to parse and extract, the BBC page 193 and 44. The fetch dominates and
the extraction is not the cost of this phase. In the containers, measured 2026-08-24 12:50:41 +0200,
the whole step ran between 216 and 526 milliseconds per article.

## 6. What is not fetched

The fetch is conditional, not universal. A feed that already carries a body above the prefilter
threshold is left alone, which is BEA and BLS on the table in section 1. This keeps the request count
proportional to the feeds that need it, and keeps a source that publishes its own full text
authoritative over a scrape of its own page.

The fetcher takes one page per article, ever. It follows no link inside the page, it renders no
JavaScript, and it retries nothing on a status other than 200. A source that requires a browser is
recorded as unreachable rather than chased, and the measurement above says none of the four sources
of this vertical needs one.

## 7. Behaviours

Not applicable. This ADR records a decision. The behaviours belong to
`docs/plans/sources-with-a-body.md`.

## 8. Definition of done

- The plan document exists and carries the behaviour list.
- Every claim in sections 1, 4 and 5 was produced by running something, and says when.

## 9. Rollback

| If | Action | Time |
|---|---|---|
| Extraction returns chrome on a source this vertical needs | The body is stored beside the feed text, never over it. Clear the body column for that source and the ingest is exactly what it is today | minutes |
| The fetch step slows ingest past its schedule | It is one call in the article processing worker, guarded by the threshold. Remove the call, keep the column and the backfill | minutes |
| A publisher objects to the fetch | The fetcher identifies itself and takes one page per article. A source is switched off by one row, per behaviour 16 of the plan | minutes |
| The DOM proves to differ from another implementation on a source added later | The DOM is one import inside `body-extractor.ts`, and four implementations were measured identical on four pages. Swap it and rerun the comparison | one hour |

## 10. Open questions

| Question | Trigger that forces an answer |
|---|---|
| Whether `robots.txt` is read before the fetch | The first source outside the four measured here, or the first publisher that answers 403 |
| Whether a stored body is refetched when a page is corrected | A release whose page changed after the note that quoted it |
| Whether the feed text is kept at all once a body exists | The first article where the two disagree in a way the owner notices |
| Whether extraction quality is measured rather than eyeballed | Phase 5, which ranks explanations and therefore needs to know what it is ranking |
