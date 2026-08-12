# Phase 4B, dynamic sources

Status: active, behaviours 1 to 13 built
Owner: repository owner
Last change: 2026-08-12
Supersedes: the Dynamic Sources section of `PLAN_v7.md` phase 4

## 1. Problem

Sources are compiled into the process. `src/sources/index.js` registers Hacker News, Reddit and
Djinni at require time, and the ingest cycle asks that registry for everything. A person cannot add
a source, cannot switch one off, and receives whatever those three sites publish regardless of the
intent they wrote.

## 2. Decision

Sources become rows in the database, owned by a user. A source is either `builtin`, meaning one of
the three existing modules, or `rss`, meaning a feed URL. The cycle fetches the union of enabled
sources across all users, once per distinct source, and matches each person only against items from
the sources they enabled.

Proof of need: `../adr/006-user-sources-rss-first.md`.

## 3. Scope

In scope:

- `user_sources` table, per user, with CRUD behind the existing auth.
- An RSS and Atom feed reader, written here, covering both formats.
- Source aware matching in the ingest cycle.
- A Sources screen: list, add a feed, switch one off, remove one.

Out of scope, deferred with their triggers:

- Web search sources such as Tavily or Brave. Trigger: a person asks for results the open feeds do
  not carry, and is willing to pay per query.
- Scrapers for sites without a feed. Trigger: three requests for the same feedless site.
- The AI connector that builds a parser from a URL. Trigger: the two above exist and are not enough.
- Feed discovery from a site URL, per feed fetch intervals, and OPML import. No trigger yet.

## 4. Behaviours

1. A person adds a source by URL and it is stored for that person only.
2. A person sees their own sources and never another person's.
3. A source can be switched off without deleting it, and can be deleted.
4. A URL that is not http or https is rejected with a validation error.
5. The same feed added twice by one person is stored once.
6. A new account starts with the three built in sources enabled.
7. The cycle fetches each distinct enabled source once, however many people subscribe to it.
8. The cycle does not fetch a source that every subscriber has switched off.
9. A person is matched only against items from sources they have enabled.
10. A source that fails does not stop the cycle, and the other sources still deliver.
11. The feed reader reads RSS 2.0 and Atom, returning title, link, body, author and published time.
12. The feed reader returns nothing for a body that is not a feed, rather than throwing.
13. The Sources screen lists the person's sources, adds one by URL, toggles and removes one.

## 5. Tests

| # | Level | File |
|---|---|---|
| 1 | L3 | `__tests__/routes/sources.test.js` |
| 2 | L3 | `__tests__/routes/sources.test.js` |
| 3 | L3 | `__tests__/routes/sources.test.js` |
| 4 | L3 | `__tests__/routes/sources.test.js` |
| 5 | L2 | `__tests__/db.test.js` |
| 6 | L3 | `__tests__/routes/sources.test.js` |
| 7 | L2 | `__tests__/scheduler.test.js` |
| 8 | L2 | `__tests__/scheduler.test.js` |
| 9 | L2 | `__tests__/scheduler.test.js` |
| 10 | L2 | `__tests__/scheduler.test.js` |
| 11 | L4 | `__tests__/sources/feed-reader.test.js` |
| 12 | L4 | `__tests__/sources/feed-reader.test.js` |
| 13 | client | `client/src/components/SourcesPage.test.jsx` |

## 6. Definition of done

- Every behaviour above has a passing test.
- `npm run verify` is green.
- A cycle run with a feed added through the interface stores items from that feed in the corpus.

## 7. Rollback

| If | Action | Time |
|---|---|---|
| Source aware matching hides everything | Match against all new items, ignoring the source filter | 5 min |
| A user feed floods the corpus | Switch the source off, it is one row | instant |
| The feed reader mangles a real feed | Put `rss-parser` behind the same function, per ADR 006 | 30 min |
| The migration misbehaves | `user_sources` is additive, drop the table and the cycle falls back to the built in registry | 10 min |

## 8. Open questions

- Per source fetch intervals. A news feed and a quarterly blog do not deserve the same cadence.
  Trigger: a user complains about staleness, or the cycle runs long because of many feeds.
- What happens to items from a source after it is deleted. They stay in the corpus today. Trigger:
  a user asks to remove them.
