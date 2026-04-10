'use strict';

const config = require('../config');
const logger = require('../logger');
const { retry } = require('../retry');

/**
 * Action: Generate Cover Letter
 * Takes a job IR item and generates a tailored cover letter via Groq LLM.
 */
async function run(item, _profileContext) {
  logger.info({ itemId: item.id, type: item.type }, 'Generating cover letter');

  const prompt = buildPrompt(item);

  const response = await retry(
    async () => {
      const res = await globalThis.fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.groq.apiKey}`,
        },
        body: JSON.stringify({
          model: config.groq.model,
          max_tokens: config.groq.maxTokens,
          messages: [
            {
              role: 'system',
              content:
                'You are a professional developer writing a concise, personalized cover letter for a job posting. Highlight relevant skills and show genuine interest. Keep it under 200 words.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Groq API ${res.status}: ${body}`);
      }

      return res.json();
    },
    {
      maxRetries: 3,
      baseDelay: 2000,
      label: 'groq-generate-cover',
      onRetry: (err, attempt) => {
        logger.warn({ err: err.message, attempt, itemId: item.id }, 'Groq retry');
      },
    },
  );

  const text = response.choices?.[0]?.message?.content?.trim();

  if (!text) {
    logger.warn({ itemId: item.id }, 'Groq returned empty response for cover letter');
    return null;
  }

  logger.info({ itemId: item.id, responseLength: text.length }, 'Cover letter generated');
  return text;
}

function buildPrompt(item) {
  const title = item.metadata?.title || 'Unknown position';
  const company = item.metadata?.company || 'Unknown company';
  const url = item.metadata?.url || '';

  return `Write a cover letter for this job:\n\nPosition: ${title}\nCompany: ${company}\nDescription: ${item.content}\nURL: ${url}\n\nCover letter:`;
}

module.exports = {
  name: 'generate-cover',
  types: ['job'],
  run,
};
