'use strict';

jest.mock('../../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const mockChat = jest.fn();
jest.mock('../../src/groq-client', () => ({
  getGroqClient: jest.fn(() => ({ chat: mockChat })),
}));

const chunkHierarchical = require('../../src/chunker/hierarchical');

const SAMPLE_TEXT = `
JavaScript is a programming language used for web development.
Node.js allows JavaScript to run on the server side.
React is a popular library for building user interfaces.
These technologies form the modern web development stack.
`.trim();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('chunkHierarchical', () => {
  it('returns summary chunk + section chunks', async () => {
    mockChat.mockResolvedValue('A document about JavaScript web development.');

    const chunks = await chunkHierarchical(SAMPLE_TEXT);

    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    const summaryChunk = chunks[0];
    expect(summaryChunk.level).toBe('document');
    expect(summaryChunk.strategy).toBe('hierarchical');
    expect(summaryChunk.chunkIndex).toBe(0);
    expect(summaryChunk.metadata.type).toBe('summary');
  });

  it('section chunks have level=section and strategy=hierarchical', async () => {
    mockChat.mockResolvedValue('Summary text.');

    const chunks = await chunkHierarchical(SAMPLE_TEXT);

    const sections = chunks.slice(1);
    for (const c of sections) {
      expect(c.level).toBe('section');
      expect(c.strategy).toBe('hierarchical');
    }
  });

  it('section chunkIndex starts at 1 (offset after summary)', async () => {
    mockChat.mockResolvedValue('Summary.');

    const chunks = await chunkHierarchical(SAMPLE_TEXT);

    if (chunks.length > 1) {
      expect(chunks[1].chunkIndex).toBe(1);
    }
  });

  it('falls back to first 200 words when groq.chat fails', async () => {
    mockChat.mockRejectedValue(new Error('Groq unavailable'));

    const chunks = await chunkHierarchical(SAMPLE_TEXT);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].level).toBe('document');
    // Summary should be the fallback text (first words of original)
    expect(chunks[0].content).toContain('JavaScript');
  });

  it('uses fallback when groq returns empty string', async () => {
    mockChat.mockResolvedValue('   ');

    const chunks = await chunkHierarchical(SAMPLE_TEXT);

    expect(chunks[0].content.length).toBeGreaterThan(0);
  });

  it('handles empty text input', async () => {
    mockChat.mockResolvedValue('');

    const chunks = await chunkHierarchical('');

    expect(Array.isArray(chunks)).toBe(true);
  });
});
