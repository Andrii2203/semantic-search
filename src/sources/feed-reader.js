'use strict';

const ENTITIES = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(text) {
  return text
    .replace(/&(lt|gt|amp|quot|apos|nbsp|#39);/g, (match) => ENTITIES[match] || match)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function toPlainText(raw) {
  if (!raw) {
    return '';
  }
  return decodeEntities(decodeEntities(raw).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tagText(block, ...tags) {
  for (const tag of tags) {
    const found = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (found) {
      const value = found[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      if (value) {
        return value;
      }
    }
  }
  return '';
}

function tagAttribute(block, tag, attribute) {
  const found = block.match(new RegExp(`<${tag}[^>]*\\s${attribute}="([^"]+)"`, 'i'));
  return found ? found[1] : '';
}

function readEntryBlocks(xml) {
  const blocks = [];
  const pattern = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match = pattern.exec(xml);

  while (match !== null) {
    blocks.push(match[2]);
    match = pattern.exec(xml);
  }

  return blocks;
}

function readEntry(block) {
  const link = tagText(block, 'link') || tagAttribute(block, 'link', 'href');

  return {
    id: tagText(block, 'guid', 'id') || link,
    title: toPlainText(tagText(block, 'title')),
    link: decodeEntities(link).trim(),
    body: toPlainText(tagText(block, 'content:encoded', 'content', 'description', 'summary')),
    author: toPlainText(tagText(block, 'dc:creator', 'author', 'name')),
    publishedAt: tagText(block, 'pubDate', 'published', 'updated'),
  };
}

function readFeed(xml) {
  if (!xml || typeof xml !== 'string') {
    return [];
  }

  return readEntryBlocks(xml)
    .map(readEntry)
    .filter((entry) => entry.title && entry.link);
}

module.exports = { readFeed, toPlainText };
