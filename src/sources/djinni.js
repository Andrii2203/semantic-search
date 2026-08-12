'use strict';

const crypto = require('crypto');
const logger = require('../logger');
const { fetchWithTimeout } = require('../http');
const config = require('../config');
const { retry } = require('../retry');

const DJINNI_BASE = 'https://djinni.co';

async function fetch(options = {}) {
  const keyword = config.djinni.keywords[0] || 'JavaScript';
  const limit = options.limit || config.djinni.limit;
  const url = `${DJINNI_BASE}/jobs/?primary_keyword=${encodeURIComponent(keyword)}`;

  logger.info({ source: 'djinni', keyword, url }, 'Fetching Djinni jobs (scraping HTML)');

  try {
    const html = await retry(async () => {
      const res = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) { throw new Error(`Djinni returned ${res.status}`) };
      return res.text();
    }, { label: 'djinni-scrape' });

    const jobs = parseJobs(html);
    warnOnLayoutChange(html, jobs.length);
    return jobs.slice(0, limit);
  } catch (err) {
    logger.warn({ err, source: 'djinni' }, 'Failed to scrape Djinni');
    return [];
  }
}

const MIN_PAGE_LENGTH_FOR_LAYOUT_WARNING = 1000;

function warnOnLayoutChange(html, jobCount) {
  if (jobCount > 0 || html.length < MIN_PAGE_LENGTH_FOR_LAYOUT_WARNING) {
    return;
  }
  logger.warn(
    { source: 'djinni', htmlLength: html.length },
    'Djinni returned a full page but no jobs were parsed, the site layout has probably changed',
  );
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseTitle(block) {
  const linkStart = block.indexOf('class="job_item__header-link');
  if (linkStart === -1) {
    return 'Vacancy';
  }

  const linkEnd = block.indexOf('</a>', linkStart);
  if (linkEnd === -1) {
    return 'Vacancy';
  }

  return stripTags(
    block.substring(linkStart, linkEnd).replace(/class="job_item__header-link[^>]*>/, ''),
  );
}

function parseDescription(block) {
  const original = block.match(
    /<span[^>]*class="[^"]*js-original-text[^"]*"[^>]*>([\s\S]*?)<\/span>/,
  );
  if (original) {
    return stripTags(original[1]);
  }

  /* istanbul ignore next */
  const truncated = block.match(
    /<span[^>]*class="[^"]*js-truncated-text[^"]*"[^>]*>([\s\S]*?)<\/span>/,
  );
  /* istanbul ignore next */
  return truncated ? stripTags(truncated[1]) : '';
}

function parseJobBlock(block) {
  const hrefMatch = block.match(/href="(\/jobs\/[^"]+)"/);
  if (!hrefMatch) {
    return null;
  }

  const relativeUrl = hrefMatch[1];
  const fullUrl = `${DJINNI_BASE}${relativeUrl}`;
  const jobId = relativeUrl.split('/').filter(Boolean).pop();
  const title = parseTitle(block);

  return {
    id: crypto.createHash('sha256').update(`djinni:${jobId}`).digest('hex').slice(0, 16),
    content: `${title}\n\n${parseDescription(block)}`,
    type: 'job',
    source: 'djinni',
    metadata: {
      title,
      url: fullUrl,
      threadUrl: fullUrl,
      author: 'Djinni.co',
      jobId,
    },
  };
}

function parseJobs(html) {
  return html
    .split('class="job-item ')
    .slice(1)
    .map(parseJobBlock)
    .filter(Boolean);
}

module.exports = {
  name: 'djinni',
  fetch
};
