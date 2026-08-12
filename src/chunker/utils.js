'use strict';

function countTokens(text) {
  return Math.ceil(countWords(text) * 1.3);
}

function countWords(text) {
  if (!text || typeof text !== 'string') {return 0;}
  return text.split(/\s+/).filter(Boolean).length;
}

function splitBySections(text) {
  if (!text || typeof text !== 'string') {return [{ title: '', content: text || '' }];}

  const sectionPattern = /^(#{1,3}\s+.+|[A-ZА-ЯІЇЄҐ][A-ZА-ЯІЇЄҐ\s]{2,}:)/gm;
  const matches = [...text.matchAll(sectionPattern)];

  if (matches.length === 0) {
    return [{ title: '', content: text.trim() }];
  }

  const sections = [];

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

function splitByParagraphs(text) {
  if (!text || typeof text !== 'string') {return [text || ''];}

  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function mergeSmallChunks(chunks, minSize = 50) {
  if (!chunks || chunks.length <= 1) {return chunks || [];}

  const merged = [];
  let buffer = null;

  for (const chunk of chunks) {
    if (!buffer) {
      buffer = { ...chunk };
      continue;
    }

    if (countWords(buffer.content) < minSize) {
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
