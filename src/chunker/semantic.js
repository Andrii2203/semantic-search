'use strict';

const { countWords, splitBySections, splitByParagraphs, mergeSmallChunks } = require('./utils');

// ─── Semantic Chunking ──────────────────────────────────────

/**
 * Splits text by semantic boundaries (sections, paragraphs).
 * Best for structured documents like resumes, articles, reports.
 *
 * @param {string} text - Input text
 * @param {Object} options
 * @param {number} options.maxChunkSize - Max words per chunk (default 300)
 * @param {number} options.minChunkSize - Min words before merging (default 50)
 * @returns {Object[]} Array of chunk objects
 */
function chunkSemantic(text, options = {}) {
  const { maxChunkSize = 300, minChunkSize = 50 } = options;

  // Step 1: Split by section headers
  const sections = splitBySections(text);

  // Step 2: For each section, split further if too large
  const rawChunks = [];

  for (const section of sections) {
    if (countWords(section.content) <= maxChunkSize) {
      rawChunks.push({
        content: section.content,
        sectionTitle: section.title || undefined,
        strategy: 'semantic',
      });
    } else {
      // Split large sections by paragraphs
      const paragraphs = splitByParagraphs(section.content);

      // Group paragraphs to stay under maxChunkSize
      let buffer = '';
      for (const para of paragraphs) {
        if (countWords(buffer + ' ' + para) > maxChunkSize && buffer.trim()) {
          rawChunks.push({
            content: buffer.trim(),
            sectionTitle: section.title || undefined,
            strategy: 'semantic',
          });
          buffer = para;
        } else {
          buffer = buffer ? buffer + '\n\n' + para : para;
        }
      }
      if (buffer.trim()) {
        rawChunks.push({
          content: buffer.trim(),
          sectionTitle: section.title || undefined,
          strategy: 'semantic',
        });
      }
    }
  }

  // Step 3: Merge small chunks
  const merged = mergeSmallChunks(rawChunks, minChunkSize);

  // Assign chunk indices
  return merged.map((chunk, i) => ({
    ...chunk,
    chunkIndex: i,
    metadata: {
      sectionTitle: chunk.sectionTitle || null,
      wordCount: countWords(chunk.content),
    },
  }));
}

module.exports = chunkSemantic;
