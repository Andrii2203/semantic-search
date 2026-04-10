'use strict';

const config = require('../config');
const logger = require('../logger');
const { retry } = require('../retry');

/**
 * Action: Generate Comment
 * Takes a post IR item and generates a relevant comment via Groq LLM.
 */
async function run(item, _profileContext) {
  logger.info({ itemId: item.id, type: item.type }, 'Generating comment');

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
                'You are a thoughtful developer who writes insightful, concise comments on tech posts. Be genuine, add value, and keep it under 3 sentences.',
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
      label: 'groq-generate-comment',
      onRetry: (err, attempt) => {
        logger.warn({ err: err.message, attempt, itemId: item.id }, 'Groq retry');
      },
    },
  );

  const text = response.choices?.[0]?.message?.content?.trim();

  if (!text) {
    logger.warn({ itemId: item.id }, 'Groq returned empty response');
    return null;
  }

  logger.info({ itemId: item.id, responseLength: text.length }, 'Comment generated');
  return text;
}

function buildPrompt(item) {
  const title = item.metadata?.title || '';
  const url = item.metadata?.url || '';

  return `Write a comment for this post:\n\nTitle: ${title}\nContent: ${item.content}\nURL: ${url}\n\nYour comment:`;
}

module.exports = {
  name: 'generate-comment',
  types: ['post'],
  run,
};
