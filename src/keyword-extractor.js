'use strict';

const { getGroqClient } = require('./groq-client');
const logger = require('./logger');

// ─── Stop Words ─────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we',
  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
  'our', 'their', 'what', 'which', 'who', 'whom', 'when', 'where',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than',
  'too', 'very', 'just', 'about', 'above', 'after', 'again', 'also',
  'any', 'as', 'because', 'before', 'between', 'into', 'through',
  'during', 'up', 'down', 'out', 'off', 'over', 'under', 'then',
  'once', 'here', 'there', 'if', 'while', 'until', 'nor', 'yet',
  'need', 'must', 'work', 'working', 'experience', 'looking',
  'required', 'preferred', 'ability', 'strong', 'good', 'etc',
  'using', 'used', 'use', 'including', 'include', 'well', 'like',
  'new', 'year', 'years',
]);

// ─── Fallback Keyword Extraction ────────────────────────────

/**
 * Extract keywords using simple TF analysis (no AI required).
 * Returns instantly — used as first-pass before AI refinement.
 */
function extractKeywordsFallback(text, maxKeywords = 15) {
  if (!text || typeof text !== 'string') return [];

  // Tokenize: extract words and multi-word technical terms
  const words = text
    .toLowerCase()
    .replace(/[^\w\s.#+\-/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Count term frequency
  const freq = new Map();
  for (const word of words) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Extract technical terms (patterns like "Node.js", "C++", "REST API")
  const techPatterns = text.match(
    /\b(?:[A-Z][a-z]+\.js|[A-Z][a-z]*(?:SQL|DB|API|UI|UX|CI|CD|ML|AI)|[A-Z]{2,}(?:\s+[A-Z][a-z]+)?|[A-Za-z]+\+\+|[A-Za-z]+#|[A-Za-z]+\.(?:js|py|ts|go|rs))\b/g,
  );

  if (techPatterns) {
    for (const term of techPatterns) {
      const key = term.toLowerCase();
      freq.set(key, (freq.get(key) || 0) + 3); // Boost technical terms
    }
  }

  // Sort by frequency and return top N
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// ─── AI Keyword Extraction ──────────────────────────────────

/**
 * Extract keywords using Groq AI. More accurate but slower.
 * Falls back to extractKeywordsFallback on error.
 */
async function extractKeywords(text, maxKeywords = 15) {
  if (!text || typeof text !== 'string' || text.trim().length < 10) {
    return extractKeywordsFallback(text, maxKeywords);
  }

  try {
    const groq = getGroqClient();
    const response = await groq.chat(
      [
        {
          role: 'system',
          content:
            'You are a keyword extraction engine. Extract the most important search keywords from the given text. ' +
            'Include: technical skills, technologies, seniority levels, domain terms, programming languages, frameworks. ' +
            `Return ONLY a JSON array of strings with at most ${maxKeywords} keywords. No explanation.`,
        },
        {
          role: 'user',
          content: text.slice(0, 4000),
        },
      ],
      { maxTokens: 256, temperature: 0.1 },
    );

    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, maxKeywords).map(String);
    }

    return extractKeywordsFallback(text, maxKeywords);
  } catch (err) {
    logger.warn({ err }, 'AI keyword extraction failed, using fallback');
    return extractKeywordsFallback(text, maxKeywords);
  }
}

module.exports = { extractKeywords, extractKeywordsFallback };
