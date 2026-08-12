# User sources, RSS first

Status: accepted
Owner: repository owner
Last change: 2026-08-12
Supersedes: none

## 1. Problem

`docs/product/VISION.md` says the left pan of the scales is any source, and that sources are
connected rather than wired in. The code has three sources compiled into the process: Hacker News,
Reddit and Djinni. A person who cares about something none of those three carry gets an empty inbox
and no way to change that.

This is the largest remaining distance between the product as described and the product as built.

## 2. Decision

Add per user sources, stored in the database, starting with RSS and keeping the three existing
sources as rows of type `builtin`. The feed parser is written here rather than taken from a package.

## 3. Proof of need

| # | Question | Answer |
|---|---|---|
| 1 | Trigger | The ingest cycle on 2026-08-12 fetched 194 items from three fixed sources. Every user of this system receives the same three sources, and the vision the project is built around says otherwise. Phase 4B has been in the plan since it was written and is the only phase never started |
| 2 | Cost of not doing it | The product is a reader for three sites. Anyone whose interest lives elsewhere gets nothing, and the intent text they write cannot help them |
| 3 | Cheapest alternative | Add more built in sources by hand, one commit per site. That does not scale past the author's own interests and keeps the owner in the loop for every new source |
| 4 | Kill criterion | Users add feeds and the inbox fills with noise their profile cannot filter, meaning the bottleneck was never the number of sources |
| 5 | Signal | Feeds added per user, and the share of matched items that come from user added feeds rather than from the three built ins |

RSS first, out of the four levels the plan lists, because it covers blogs, news sites, YouTube
channels, subreddits and many product changelogs without an API key, without a cost per request and
without a scraper that breaks when a page is restyled.

## 4. Why the feed parser is written here

The obvious package is `rss-parser`, and it would work.

| # | Question | Answer |
|---|---|---|
| 1 | Absent trigger | We already parse Atom in `src/sources/reddit.js` and it has worked in production. There is no observed feed we failed to read |
| 2 | Cheaper path | Around eighty lines covering RSS 2.0 and Atom, the two formats that matter, tested against fixtures of both |
| 3 | Cost exceeds benefit | The package pulls a full XML stack for a job that is element extraction from a standardised format |
| 4 | Reversibility | Adopting it later is a one file change behind a stable function signature |
| 5 | Carrying cost | One more dependency to keep current in an application that has to run unattended on a free tier host |

This is deliberately not the Djinni mistake repeated. Djinni parses a rendered page whose markup its
owners change at will. RSS and Atom are specifications with fixed element names, and a feed that
stops parsing is a feed that stopped being a feed.

Kill criterion for this half of the decision: a real feed a user adds that the parser reads
incorrectly, twice. Then `rss-parser` goes in behind the same function.

## 5. Consequences

- Content stays shared. Two users subscribed to the same feed cause one fetch and one stored copy.
- Matching becomes source aware: a person is matched only against items from sources they enabled.
  Without that, adding a feed would change nothing about what appears in the inbox.
- The three built in sources become rows, so they can be switched off. A new account gets them
  enabled, otherwise a new inbox stays empty until the person adds something.

## 6. Definition of done

Carried by `../plans/phase-4b-dynamic-sources.md`.
