'use strict';

const { getGroqClient } = require('./groq-client');
const logger = require('./logger');

async function hydeExpand(query, groqClient = getGroqClient()) {
  if (!query || query.trim().length === 0) {return null;}

  try {
    const doc = await groqClient.chat(
      [
        {
          role: 'system',
          content:
            'You write a short, realistic passage that would be the ideal document answering ' +
            'the user request. Write 2-4 sentences of plain, factual content as if it were an ' +
            'excerpt from such a document. No preamble, no quotes, no meta-commentary.',
        },
        {
          role: 'user',
          content: query.slice(0, 1000),
        },
      ],
      { maxTokens: 256, temperature: 0.3 },
    );

    const text = (doc || '').trim();
    if (!text) {return null;}

    logger.info({ queryLength: query.length, docLength: text.length }, 'HyDE expansion generated');
    return text;
  } catch (err) {
    logger.warn({ err }, 'HyDE expansion failed, falling back to raw query');
    return null;
  }
}

module.exports = { hydeExpand };
