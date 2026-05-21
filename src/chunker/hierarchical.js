'use strict';

const chunkSemantic = require('./semantic');
const { getGroqClient } = require('../groq-client');
const logger = require('../logger');

// ─── Hierarchical Chunking ──────────────────────────────────

/**
 * Two-level chunking: document summary + section chunks.
 * Uses Groq AI to generate a summary of the entire document.
 *
 * @param {string} text - Input text
 * @param {Object} options
 * @param {number} options.maxChunkSize - Max words per section chunk (default 300)
 * @param {number} options.minChunkSize - Min words before merging (default 50)
 * @returns {Promise<Object[]>} Array of chunk objects (summary + sections)
 */
async function chunkHierarchical(text, options = {}) {
  // Level 1: Generate document summary via AI
  const summary = await generateSummary(text);

  const summaryChunk = {
    content: summary,
    chunkIndex: 0,
    level: 'document',
    strategy: 'hierarchical',
    metadata: {
      type: 'summary',
      wordCount: summary.split(/\s+/).filter(Boolean).length,
    },
  };

  // Level 2: Semantic chunks of sections
  const sectionChunks = chunkSemantic(text, options).map((chunk, i) => ({
    ...chunk,
    chunkIndex: i + 1, // offset by 1 for summary
    level: 'section',
    strategy: 'hierarchical',
  }));

  return [summaryChunk, ...sectionChunks];
}

/**
 * Generate a concise summary of the document via Groq API.
 * Falls back to first 200 words if API fails.
 */
async function generateSummary(text) {
  try {
    const groq = getGroqClient();
    const response = await groq.chat(
      [
        {
          role: 'system',
          content:
            'You are a document summarizer. Summarize the given text in 3-5 concise sentences. ' +
            'Focus on key skills, experience, and qualifications. Return ONLY the summary text.',
        },
        {
          role: 'user',
          content: `Summarize this document:\n\n${text.slice(0, 4000)}`,
        },
      ],
      { maxTokens: 256, temperature: 0.2 },
    );

    return response.trim() || fallbackSummary(text);
  } catch (err) {
    logger.warn({ err }, 'Summary generation failed, using fallback');
    return fallbackSummary(text);
  }
}

function fallbackSummary(text) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, 200).join(' ');
}

module.exports = chunkHierarchical;
