'use strict';

const crypto = require('crypto');
const logger = require('../logger');
const { fetchWithTimeout } = require('../http');
const { retry } = require('../retry');
const { validateIRBatch } = require('../validation');
const config = require('../config');

const REDDIT_BASE = 'https://www.reddit.com';

function parseAtomFeed(xml) {
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;

  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];

    const text = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
      const found = block.match(r);
      if (!found) {return '';}
      return found[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    };

    const attr = (tag, attrName) => {
      const r = new RegExp(`<${tag}[^>]+${attrName}="([^"]+)"`);
      const found = block.match(r);
      return found ? found[1] : '';
    };

    entries.push({
      id:       text('id'),
      title:    text('title'),
      link:     attr('link', 'href'),
      content:  text('content'),
      author:   text('name'),
      updated:  text('updated'),
      category: attr('category', 'term'),
    });
  }

  return entries;
}

function stripHtml(html) {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetch(options = {}) {
  const subreddits = config.reddit.subreddits.join('+');
  const limit = options.limit || config.reddit.limit;

  logger.info({ source: 'reddit', subreddits, limit }, 'Fetching Reddit RSS');

  let entries;
  try {
    entries = await retry(
      async () => {
        const url = `${REDDIT_BASE}/r/${subreddits}/hot.rss?limit=${limit}`;
        const res = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'SemanticSearch/1.0',
            Accept: 'application/rss+xml, application/atom+xml, text/xml',
          },
        });

        if (!res.ok) {
          throw new Error(`Reddit RSS responded with ${res.status}`);
        }

        const xml = await res.text();
        return parseAtomFeed(xml);
      },
      { maxRetries: 3, baseDelay: 2000, label: 'reddit-rss' },
    );
  } catch (err) {
    logger.warn({ err, source: 'reddit' }, 'Failed to fetch Reddit RSS');
    return [];
  }

  const irItems = entries
    .filter((e) => e.title && e.link)
    .map((e) => {
      const id = crypto
        .createHash('sha256')
        .update(`reddit:${e.id || e.link}`)
        .digest('hex')
        .slice(0, 16);

      const bodyText = e.content ? stripHtml(e.content).slice(0, 2000) : '';
      const content = bodyText ? `${e.title}\n\n${bodyText}` : e.title;

      return {
        id,
        content,
        type: 'post',
        source: 'reddit',
        metadata: {
          title:     e.title,
          url:       e.link,
          author:    e.author ? e.author.replace('/u/', '') : 'unknown',
          subreddit: e.category || subreddits,
          permalink: e.link,
        },
      };
    });

  const validItems = validateIRBatch(irItems, logger);

  logger.info(
    { source: 'reddit', fetched: entries.length, valid: validItems.length },
    'Reddit RSS fetch complete',
  );

  return validItems;
}

module.exports = { name: 'reddit', fetch };
