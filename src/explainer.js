'use strict';

const { getGroqClient } = require('./groq-client');
const logger = require('./logger');

async function explain(item, profile) {
  if (!item || !profile) {
    return 'No explanation available.';
  }

  try {
    const groq = getGroqClient();
    const response = await groq.chat(
      [
        {
          role: 'system',
          content:
            'You are a match explainer. Given a search query and a document, explain WHY the document is relevant. ' +
            'Be specific: mention exact keyword matches, inferred skills, experience alignment. ' +
            'Also mention what is MISSING if anything. Keep it concise (2-4 sentences).',
        },
        {
          role: 'user',
          content: `Search Query:\n${(profile.rawInput || '').slice(0, 1000)}\n\nKeywords: ${(profile.keywords || []).join(', ')}\n\nDocument:\n${(item.content || '').slice(0, 2000)}`,
        },
      ],
      { maxTokens: 256, temperature: 0.2 },
    );

    return response.trim() || 'No explanation available.';
  } catch (err) {
    logger.warn({ err, itemId: item.id }, 'Explanation generation failed');
    return generateFallbackExplanation(item, profile);
  }
}

function generateFallbackExplanation(item, profile) {
  const keywords = profile.keywords || [];
  const content = (item.content || '').toLowerCase();

  const matched = keywords.filter((k) => content.includes(k.toLowerCase()));
  const missing = keywords.filter((k) => !content.includes(k.toLowerCase()));

  let explanation = '';
  if (matched.length > 0) {
    explanation += `Matches: ${matched.join(', ')}. `;
  }
  if (missing.length > 0) {
    explanation += `Missing: ${missing.join(', ')}.`;
  }

  return explanation || 'Matched by semantic similarity.';
}

module.exports = { explain, generateFallbackExplanation };
