'use strict';

const { extractKeywordsFallback } = require('../src/keyword-extractor');

describe('Keyword Extractor: Fallback', () => {
  test('extracts technical terms from job description', () => {
    const text = `
      We are looking for a Senior Node.js developer with experience in PostgreSQL,
      Docker, and Kubernetes. Must have 5+ years experience with REST APIs and
      microservices architecture. Knowledge of TypeScript is a plus.
    `;
    const keywords = extractKeywordsFallback(text);

    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.length).toBeLessThanOrEqual(15);
    // Should find at least some technical terms
    const joined = keywords.join(' ').toLowerCase();
    expect(joined).toMatch(/node|postgresql|docker|kubernetes|typescript/i);
  });

  test('returns empty for empty input', () => {
    expect(extractKeywordsFallback('')).toEqual([]);
    expect(extractKeywordsFallback(null)).toEqual([]);
    expect(extractKeywordsFallback(undefined)).toEqual([]);
  });

  test('filters stop words', () => {
    const text = 'the quick brown fox jumps over the lazy dog and the cat';
    const keywords = extractKeywordsFallback(text);
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('and');
    expect(keywords).not.toContain('over');
  });

  test('respects maxKeywords limit', () => {
    const text = Array.from({ length: 100 }, (_, i) => `technology${i}`).join(' ');
    const keywords = extractKeywordsFallback(text, 5);
    expect(keywords).toHaveLength(5);
  });
});
