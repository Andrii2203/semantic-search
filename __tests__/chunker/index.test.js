'use strict';

const { chunk } = require('../../src/chunker');

describe('Chunker: Unified Interface', () => {
  test('short text (<= 200 tokens) returns strategy "none"', () => {
    const text = 'Short text for testing purposes.';
    return chunk(text).then((result) => {
      expect(result).toHaveLength(1);
      expect(result[0].strategy).toBe('none');
      expect(result[0].level).toBe('document');
    });
  });

  test('empty text returns empty array', async () => {
    expect(await chunk('')).toEqual([]);
    expect(await chunk(null)).toEqual([]);
    expect(await chunk(undefined)).toEqual([]);
  });

  test('unknown strategy throws AppError with INVALID_STRATEGY', async () => {
    const longText = 'word '.repeat(300);
    await expect(chunk(longText, 'nonexistent')).rejects.toThrow('Unknown chunking strategy');
  });

  test('fixed strategy works through unified interface', async () => {
    const longText = 'word '.repeat(300);
    const result = await chunk(longText, 'fixed', { chunkSize: 200, overlap: 50 });
    expect(result.length).toBeGreaterThan(1);
    result.forEach((c) => expect(c.strategy).toBe('fixed'));
  });

  test('semantic strategy works through unified interface', async () => {
    const longText = `
EXPERIENCE:
${'Worked at company doing engineering tasks. '.repeat(20)}

SKILLS:
${'JavaScript Python Go Rust '.repeat(15)}
    `.trim();
    const result = await chunk(longText, 'semantic');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
