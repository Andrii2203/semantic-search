'use strict';

// Run once. Writes a dated snapshot that every evaluation run reads.
//
//   eval/snapshots/<date>/corpus.json   Guardian articles, full body, the documents being searched
//   eval/snapshots/<date>/posts.json    Hacker News and Reddit posts, raw material for intents
//
// Historical, so one run replaces waiting thirty days for RSS windows.
//
//   node scripts/fetch-eval-corpus.js [days]
//
// See docs/plans/evaluation-corpus.md.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchFeed } = require('../src/sources/rss');

const DAYS = parseInt(process.argv[2] || '180', 10);
const GUARDIAN_SECTIONS = ['technology', 'science', 'business'];
const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY || 'test';
const GUARDIAN_PAGE_SIZE = 50;
const HN_MIN_POINTS = 20;
const HN_PAGES = 6;
const REDDIT_SUBS = ['technology', 'science', 'business', 'programming'];

const NON_LATIN = /[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Arabic}]/u;

function id(prefix, value) {
  return crypto.createHash('sha256').update(`${prefix}:${value}`).digest('hex').slice(0, 16);
}

function words(text) {
  return (text || '').split(/\s+/).filter(Boolean).length;
}

function isEnglish(text) {
  return !NON_LATIN.test((text || '').slice(0, 400));
}

function fromDate() {
  return new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10);
}

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'SemanticSearch/1.0' } });
  if (!response.ok) {
    throw new Error(`${response.status} from ${url.split('?')[0]}`);
  }
  return response.json();
}

async function fetchGuardianSection(section, fetchedAt) {
  const base =
    `https://content.guardianapis.com/search?section=${section}` +
    `&from-date=${fromDate()}&page-size=${GUARDIAN_PAGE_SIZE}` +
    `&show-fields=bodyText&api-key=${GUARDIAN_KEY}`;

  const first = (await getJson(`${base}&page=1`)).response;
  const articles = [];

  for (let page = 1; page <= first.pages; page++) {
    const body = page === 1 ? first : (await getJson(`${base}&page=${page}`)).response;

    for (const result of body.results) {
      const text = result.fields?.bodyText || '';
      if (!text || !isEnglish(text)) {
        continue;
      }
      articles.push({
        id: id('guardian', result.id),
        content: `${result.webTitle}\n\n${text}`,
        type: 'article',
        source: `guardian_${section}`,
        metadata: {
          title: result.webTitle,
          url: result.webUrl,
          author: 'guardian',
          section,
          publishedAt: result.webPublicationDate,
        },
        fetchedAt,
      });
    }
    process.stdout.write(`  guardian/${section} page ${page}/${first.pages}\r`);
  }

  console.log(`  guardian/${section}: ${articles.length} articles`.padEnd(60));
  return articles;
}

function hnToPost(hit, kind, fetchedAt) {
  const title = hit.title || hit.story_title || '';
  const text = (hit.story_text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    id: id('hn', hit.objectID),
    content: text ? `${title}\n\n${text}` : title,
    type: 'post',
    source: `hn_${kind}`,
    metadata: {
      title,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      author: hit.author || 'unknown',
      score: hit.points,
      commentCount: hit.num_comments,
      publishedAt: hit.created_at,
    },
    fetchedAt,
  };
}

async function fetchHn(tags, kind, fetchedAt) {
  const since = Math.floor((Date.now() - DAYS * 86400_000) / 1000);
  const filters = `created_at_i>${since},points>${HN_MIN_POINTS}`;
  const posts = [];

  for (let page = 0; page < HN_PAGES; page++) {
    const url =
      `https://hn.algolia.com/api/v1/search_by_date?tags=${tags}` +
      `&numericFilters=${filters}&hitsPerPage=100&page=${page}`;
    const body = await getJson(url);
    if (!body.hits?.length) {
      break;
    }
    for (const hit of body.hits) {
      const post = hnToPost(hit, kind, fetchedAt);
      if (isEnglish(post.content)) {
        posts.push(post);
      }
    }
    if (page + 1 >= body.nbPages) {
      break;
    }
  }

  console.log(`  hn/${kind}: ${posts.length} posts`);
  return posts;
}

function redditToPosts(items, sub, fetchedAt) {
  return items.filter((item) => isEnglish(item.content)).map((item) => ({
    id: item.id,
    content: item.content,
    type: 'post',
    source: `reddit_${sub}`,
    metadata: item.metadata,
    fetchedAt,
  }));
}

async function fetchReddit(fetchedAt) {
  const posts = [];

  for (const sub of REDDIT_SUBS) {
    try {
      const items = await fetchFeed(`https://www.reddit.com/r/${sub}/.rss`);
      posts.push(...redditToPosts(items, sub, fetchedAt));
    } catch (err) {
      console.log(`  reddit/${sub} failed: ${err.message}`);
    }
  }

  console.log(`  reddit: ${posts.length} posts`);
  return posts;
}

function report(label, items) {
  const lengths = items.map((item) => words(item.content)).sort((a, b) => a - b);
  const bySource = {};
  for (const item of items) {
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  }
  console.log(
    `${label.padEnd(8)} ${String(items.length).padStart(5)} items  ` +
      `words min ${lengths[0]} median ${lengths[Math.floor(lengths.length / 2)]} max ${lengths[lengths.length - 1]}`,
  );
  console.log(`         ${JSON.stringify(bySource)}`);
}

async function main() {
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const dir = path.resolve(__dirname, '..', 'eval', 'snapshots', fetchedAt);

  console.log(`Snapshot ${fetchedAt}, looking back ${DAYS} days\n`);

  const articles = [];
  for (const section of GUARDIAN_SECTIONS) {
    articles.push(...(await fetchGuardianSection(section, fetchedAt)));
  }

  const posts = [
    ...(await fetchHn('ask_hn', 'ask', fetchedAt)),
    ...(await fetchHn('show_hn', 'show', fetchedAt)),
    ...(await fetchHn('story', 'story', fetchedAt)),
    ...(await fetchReddit(fetchedAt)),
  ];

  const unique = (items) => [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((a, b) => a.id.localeCompare(b.id));

  const corpus = unique(articles);
  const intentPool = unique(posts);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'corpus.json'), `${JSON.stringify({ fetchedAt, days: DAYS, items: corpus }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'posts.json'), `${JSON.stringify({ fetchedAt, days: DAYS, items: intentPool }, null, 2)}\n`);

  console.log('');
  report('corpus', corpus);
  report('posts', intentPool);

  const bytes = fs.statSync(path.join(dir, 'corpus.json')).size + fs.statSync(path.join(dir, 'posts.json')).size;
  console.log(`\nWritten to ${path.relative(process.cwd(), dir)}, ${(bytes / 1048576).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error('FETCH FAILED:', err.message);
  process.exit(1);
});
