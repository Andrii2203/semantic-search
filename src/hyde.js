'use strict';

const { getGroqClient } = require('./groq-client');
const logger = require('./logger');

// ─── HyDE (Hypothetical Document Embeddings) ─────────────────
//
// Instead of embedding the raw query, ask the LLM to imagine an ideal
// document answering it, then embed THAT. The hypothetical doc lives in the
// same space as real documents, so semantic match is sharper.
// Phase 2.5: optional, paid (1 Groq call per search). Off by default.

/**
 * Generate a hypothetical document for a query.
 *
 * @param {string} query - The user's search query
 * @param {Object} [groqClient] - Injected client (defaults to shared singleton)
 * @returns {Promise<string|null>} Hypothetical document text, or null on failure
 */
async function hydeExpand(query, groqClient = getGroqClient()) {
  if (!query || query.trim().length === 0) return null;

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
    if (!text) return null;

    logger.info({ queryLength: query.length, docLength: text.length }, 'HyDE expansion generated');
    return text;
  } catch (err) {
    logger.warn({ err }, 'HyDE expansion failed, falling back to raw query');
    return null;
  }
}

module.exports = { hydeExpand };
