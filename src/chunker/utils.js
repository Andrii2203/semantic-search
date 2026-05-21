'use strict';

// ─── Token / Word Counting ──────────────────────────────────

/**
 * Approximate token count (words × 1.3 for English).
 * Good enough for MiniLM-L6-v2 (256 token limit ≈ 200 words).
 */
function countTokens(text) {
  return Math.ceil(countWords(text) * 1.3);
}

function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

// ─── Section Splitting ──────────────────────────────────────

/**
 * Split text by section headers.
 * Recognizes: "## Heading", "Experience:", "ОСВІТА:", etc.
 */
function splitBySections(text) {
  if (!text || typeof text !== 'string') return [{ title: '', content: text || '' }];

  const sectionPattern = /^(#{1,3}\s+.+|[A-ZА-ЯІЇЄҐ][A-ZА-ЯІЇЄҐ\s]{2,}:)/gm;
  const matches = [...text.matchAll(sectionPattern)];

  if (matches.length === 0) {
    return [{ title: '', content: text.trim() }];
  }

  const sections = [];

  // Content before first section header
  const beforeFirst = text.slice(0, matches[0].index).trim();
  if (beforeFirst) {
    sections.push({ title: '', content: beforeFirst });
  }

  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][0].replace(/^#+\s*/, '').replace(/:$/, '').trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();

    if (content) {
      sections.push({ title, content });
    }
  }

  return sections;
}

// ─── Paragraph Splitting ────────────────────────────────────

/**
 * Split text by double newlines (paragraphs).
 */
function splitByParagraphs(text) {
  if (!text || typeof text !== 'string') return [text || ''];

  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ─── Merge Small Chunks ─────────────────────────────────────

/**
 * Merge consecutive chunks that are smaller than minSize words.
 */
function mergeSmallChunks(chunks, minSize = 50) {
  if (!chunks || chunks.length <= 1) return chunks || [];

  const merged = [];
  let buffer = null;

  for (const chunk of chunks) {
    if (!buffer) {
      buffer = { ...chunk };
      continue;
    }

    if (countWords(buffer.content) < minSize) {
      // Merge into buffer
      buffer.content = buffer.content + '\n\n' + chunk.content;
      if (chunk.sectionTitle && !buffer.sectionTitle) {
        buffer.sectionTitle = chunk.sectionTitle;
      }
    } else {
      merged.push(buffer);
      buffer = { ...chunk };
    }
  }

  if (buffer) {
    // If the last buffer is still too small, merge with previous
    if (merged.length > 0 && countWords(buffer.content) < minSize) {
      merged[merged.length - 1].content += '\n\n' + buffer.content;
    } else {
      merged.push(buffer);
    }
  }

  return merged;
}

module.exports = {
  countTokens,
  countWords,
  splitBySections,
  splitByParagraphs,
  mergeSmallChunks,
};
