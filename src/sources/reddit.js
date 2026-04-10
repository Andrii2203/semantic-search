'use strict';

const crypto = require('crypto');
const logger = require('../logger');
const { retry } = require('../retry');
const { validateIRBatch } = require('../validation');
const config = require('../config');

const REDDIT_BASE = 'https://www.reddit.com';

/**
 * Source: Reddit
 * Fetches hot posts from configured subreddits and converts them to IR format.
 */
async function fetch(options = {}) {
  const subreddits = config.reddit.subreddits.join('+');
  const limit = options.limit || config.reddit.limit;

  logger.info({ source: 'reddit', subreddits, limit }, 'Fetching Reddit posts');

  let posts;
  try {
    posts = await retry(
      async () => {
        const url = `${REDDIT_BASE}/r/${subreddits}/hot.json?limit=${limit}&raw_json=1`;
        const res = await globalThis.fetch(url, {
          headers: {
            'User-Agent': 'IcebergOS-SemanticSearch/1.0 (by /u/icebergbot)',
          },
        });

        if (!res.ok) {
          throw new Error(`Reddit API responded with ${res.status}`);
        }

        const json = await res.json();
        return json.data?.children || [];
      },
      { maxRetries: 3, baseDelay: 2000, label: 'reddit-hot' },
    );
  } catch (err) {
    logger.warn({ err, source: 'reddit' }, 'Failed to fetch Reddit posts');
    return [];
  }

  // Convert to IR format
  const irItems = posts
    .map((child) => child.data)
    .filter((post) => {
      // Skip stickied/pinned posts
      if (post.stickied) { return false };
      // Skip removed/deleted
      if (post.removed_by_category) { return false };
      return true;
    })
    .map((post) => ({
      id: crypto.createHash('sha256').update(`reddit:${post.id}`).digest('hex').slice(0, 16),
      content: buildContent(post),
      type: 'post',
      source: 'reddit',
      metadata: {
        title: post.title,
        url: post.url || `https://www.reddit.com${post.permalink}`,
        author: post.author || 'unknown',
        redditId: post.id,
        subreddit: post.subreddit,
        score: post.score,
        commentCount: post.num_comments || 0,
        permalink: `https://www.reddit.com${post.permalink}`,
        threadUrl: `https://www.reddit.com${post.permalink}`,
      },
    }));

  // Validate through Zod schema
  const validItems = validateIRBatch(irItems, logger);

  logger.info(
    { source: 'reddit', fetched: posts.length, valid: validItems.length },
    'Reddit fetch complete',
  );

  return validItems;
}

/**
 * Builds the content string from a Reddit post.
 * Unlike HN, Reddit posts often have selftext (the body of the post).
 */
function buildContent(post) {
  const parts = [post.title];

  if (post.selftext && post.selftext.trim().length > 0) {
    // Self posts have body text
    parts.push(post.selftext.trim());
  }

  return parts.join('\n\n');
}

module.exports = {
  name: 'reddit',
  fetch,
};
