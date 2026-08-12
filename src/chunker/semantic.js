'use strict';

const { countWords, splitBySections, splitByParagraphs, mergeSmallChunks } = require('./utils');

function chunkSemantic(text, options = {}) {
  const { maxChunkSize = 300, minChunkSize = 50 } = options;

  const sections = splitBySections(text);

  const rawChunks = [];

  for (const section of sections) {
    if (countWords(section.content) <= maxChunkSize) {
      rawChunks.push({
        content: section.content,
        sectionTitle: section.title || undefined,
        strategy: 'semantic',
      });
    } else {
      const paragraphs = splitByParagraphs(section.content);

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

  const merged = mergeSmallChunks(rawChunks, minChunkSize);

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
