'use strict';

const crypto = require('crypto');
const logger = require('../logger');
const { fetchWithTimeout } = require('../http');
const { retry } = require('../retry');
const { readFeed } = require('./feed-reader');
const { validateIRBatch } = require('../validation');

const MAX_BODY_LENGTH = 2000;

function toIR(entry, feedUrl) {
  const body = entry.body ? entry.body.slice(0, MAX_BODY_LENGTH) : '';

  return {
    id: crypto.createHash('sha256').update(`rss:${entry.id}`).digest('hex').slice(0, 16),
    content: body ? `${entry.title}\n\n${body}` : entry.title,
    type: 'post',
    source: 'rss',
    metadata: {
      title: entry.title,
      url: entry.link,
      author: entry.author || 'unknown',
      feedUrl,
      publishedAt: entry.publishedAt || null,
    },
  };
}

async function fetchFeed(feedUrl) {
  logger.info({ source: 'rss', feedUrl }, 'Fetching feed');

  const xml = await retry(
    async () => {
      const res = await fetchWithTimeout(feedUrl, {
        headers: {
          'User-Agent': 'SemanticSearch/1.0',
          Accept: 'application/rss+xml, application/atom+xml, text/xml, */*',
        },
      });
      if (!res.ok) {
        throw new Error(`Feed responded with ${res.status}`);
      }
      return res.text();
    },
    { maxRetries: 2, baseDelay: 1000, label: `rss-${feedUrl}` },
  );

  const entries = readFeed(xml);
  const items = validateIRBatch(
    entries.map((entry) => toIR(entry, feedUrl)),
    logger,
  );

  logger.info({ source: 'rss', feedUrl, entries: entries.length, valid: items.length }, 'Feed read');
  return items;
}

module.exports = { fetchFeed };
