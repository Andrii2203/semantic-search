'use strict';

const crypto = require('crypto');
const logger = require('../logger');
const { retry } = require('../retry');
const { validateIRBatch } = require('../validation');

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const MAX_STORIES = 130;

/**
 * Source: Hacker News
 * Fetches top stories and converts them to IR format.
 */
async function fetch(options = {}) {
  const limit = options.limit || MAX_STORIES;

  logger.info({ source: 'hn', limit }, 'Fetching Hacker News stories');

  let storyIds;
  try {
    storyIds = await retry(
      async () => {
        const res = await globalThis.fetch(`${HN_API_BASE}/topstories.json`);
        if (!res.ok) {
          throw new Error(`HN API responded with ${res.status}`);
        }
        return res.json();
      },
      { maxRetries: 3, baseDelay: 1000, label: 'hn-topstories' },
    );
  } catch (err) {
    logger.warn({ err, source: 'hn' }, 'Failed to fetch HN top stories');
    return [];
  }

  const topIds = storyIds.slice(0, limit);

  // Fetch story details in parallel (with concurrency limit)
  const stories = await fetchStoriesDetails(topIds);

  // Convert to IR format
  const irItems = stories
    .filter((s) => s && s.title && s.type === 'story')
    .map((story) => ({
      id: crypto.createHash('sha256').update(`hn:${story.id}`).digest('hex').slice(0, 16),
      content: buildContent(story),
      type: 'post',
      source: 'hn',
      metadata: {
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        author: story.by || 'unknown',
        hnId: story.id,
        threadUrl: `https://news.ycombinator.com/item?id=${story.id}`,
        score: story.score,
        commentCount: story.descendants || 0,
      },
    }));

  // Validate through Zod schema
  const validItems = validateIRBatch(irItems, logger);

  logger.info({ source: 'hn', fetched: stories.length, valid: validItems.length }, 'HN fetch complete');

  return validItems;
}

/**
 * Fetches story details with concurrency limit.
 */
async function fetchStoriesDetails(ids) {
  const CONCURRENCY = 5;
  const results = [];

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((id) => fetchStoryDetail(id)),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }
  }

  return results;
}

/**
 * Fetches a single story detail.
 */
async function fetchStoryDetail(id) {
  try {
    const res = await globalThis.fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch (_err) {
    return null;
  }
}

/**
 * Builds the content string for embeddings.
 */
function buildContent(story) {
  const parts = [story.title];
  if (story.text) {
    // Strip HTML tags from HN text
    parts.push(story.text.replace(/<[^>]*>/g, ''));
  }
  return parts.join('. ');
}

module.exports = {
  name: 'hn',
  fetch,
};
