'use strict';

const chunkFixed = require('../../src/chunker/fixed');

describe('Chunker: Fixed Size', () => {
  test('short text (< chunkSize) returns one chunk', () => {
    const text = 'Hello world this is a short text';
    const result = chunkFixed(text, { chunkSize: 200 });
    expect(result).toHaveLength(1);
    expect(result[0].strategy).toBe('fixed');
    expect(result[0].chunkIndex).toBe(0);
    expect(result[0].content).toBe(text);
  });

  test('500 words split into multiple chunks with overlap', () => {
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const result = chunkFixed(text, { chunkSize: 200, overlap: 50 });

    expect(result.length).toBeGreaterThan(1);
    // First chunk should have 200 words
    expect(result[0].metadata.wordCount).toBe(200);
    // All chunks should have strategy 'fixed'
    result.forEach((c) => expect(c.strategy).toBe('fixed'));
    // Chunk indices should be sequential
    result.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  test('empty text returns empty array', () => {
    expect(chunkFixed('')).toEqual([]);
    expect(chunkFixed('   ')).toEqual([]);
  });

  test('overlap creates overlapping content', () => {
    const words = Array.from({ length: 300 }, (_, i) => `w${i}`);
    const text = words.join(' ');
    const result = chunkFixed(text, { chunkSize: 200, overlap: 50 });

    expect(result).toHaveLength(2);
    // Second chunk should start at word 150 (200 - 50 overlap)
    expect(result[1].metadata.start).toBe(150);
  });

  test('metadata contains start, end, wordCount', () => {
    const text = Array.from({ length: 250 }, (_, i) => `x${i}`).join(' ');
    const result = chunkFixed(text, { chunkSize: 200, overlap: 0 });
    
    expect(result[0].metadata.start).toBe(0);
    expect(result[0].metadata.end).toBe(200);
    expect(result[0].metadata.wordCount).toBe(200);
  });
});
