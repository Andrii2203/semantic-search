'use strict';

function chunkFixed(text, options = {}) {
  const { chunkSize = 200, overlap = 50 } = options;
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];

  if (words.length === 0) {return chunks;}

  const step = Math.max(1, chunkSize - overlap);

  for (let i = 0; i < words.length; i += step) {
    const chunkWords = words.slice(i, i + chunkSize);
    const content = chunkWords.join(' ');

    if (content.trim().length > 0) {
      chunks.push({
        content,
        chunkIndex: chunks.length,
        strategy: 'fixed',
        metadata: {
          start: i,
          end: Math.min(i + chunkSize, words.length),
          wordCount: chunkWords.length,
        },
      });
    }

    if (i + chunkSize >= words.length) {break;}
  }

  return chunks;
}

module.exports = chunkFixed;
