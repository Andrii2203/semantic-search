'use strict';

const crypto = require('crypto');
const logger = require('../logger');
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
      const res = await globalThis.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) { throw new Error(`Djinni returned ${res.status}`) };
      return res.text();
    }, { label: 'djinni-scrape' });

    return parseJobs(html).slice(0, limit);
  } catch (err) {
    logger.warn({ err, source: 'djinni' }, 'Failed to scrape Djinni');
    return [];
  }
}

function parseJobs(html) {
  const jobs = [];
  // Нова логіка парсингу: шукаємо блоки за новим класом job-item
  const blocks = html.split('class="job-item ');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Витягуємо посилання на вакансію
    const hrefMatch = block.match(/href="(\/jobs\/[^"]+)"/);
    if (!hrefMatch) { continue };

    const relativeUrl = hrefMatch[1];
    const fullUrl = `https://djinni.co${relativeUrl}`;
    const jobId = relativeUrl.split('/').filter(Boolean).pop();

    // Витягуємо заголовок (знаходиться в тегу посилання)
    const linkStart = block.indexOf('class="job_item__header-link');
    let title = 'Vacancy';
    if (linkStart !== -1) {
      const linkEnd = block.indexOf('</a>', linkStart);
      if (linkEnd !== -1) {
        const linkContent = block.substring(linkStart, linkEnd);
        title = linkContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/class="job_item__header-link[^>]*>/, '').trim();
      }
    }

    // Витягуємо опис (шукаємо повний текст у прихованому span)
    let description = '';
    const descMatch = block.match(/<span[^>]*class="[^"]*js-original-text[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const fallbackMatch = block.match(/<span[^>]*class="[^"]*js-truncated-text[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    
    if (descMatch) {
      description = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      /* istanbul ignore next */
    } else if (fallbackMatch) {
      /* istanbul ignore next */
      description = fallbackMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    jobs.push({
      id: crypto.createHash('sha256').update(`djinni:${jobId}`).digest('hex').slice(0, 16),
      content: `${title}\n\n${description}`,
      type: 'job',
      source: 'djinni',
      metadata: {
        title: title,
        url: fullUrl,
        threadUrl: fullUrl,
        author: 'Djinni.co',
        jobId: jobId
      }
    });
  }

  return jobs;
}


module.exports = {
  name: 'djinni',
  fetch
};
