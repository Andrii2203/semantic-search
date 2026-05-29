'use strict';

jest.mock('../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const mockChat = jest.fn();
jest.mock('../src/groq-client', () => ({
  getGroqClient: jest.fn(() => ({ chat: mockChat })),
}));

const { explain, generateFallbackExplanation } = require('../src/explainer');

beforeEach(() => {
  jest.clearAllMocks();
});

const ITEM = {
  id: 'item-1',
  content: 'Senior JavaScript developer with Node.js and React experience',
};

const PROFILE = {
  rawInput: 'Looking for JavaScript developer',
  keywords: ['javascript', 'react'],
};

describe('explain', () => {
  it('returns fallback message when item is null', async () => {
    const result = await explain(null, PROFILE);
    expect(result).toBe('No explanation available.');
  });

  it('returns fallback message when profile is null', async () => {
    const result = await explain(ITEM, null);
    expect(result).toBe('No explanation available.');
  });

  it('calls groq.chat and returns trimmed response', async () => {
    mockChat.mockResolvedValue('  This matches because of JavaScript skills.  ');

    const result = await explain(ITEM, PROFILE);

    expect(mockChat).toHaveBeenCalled();
    expect(result).toBe('This matches because of JavaScript skills.');
  });

  it('returns fallback explanation string when groq returns empty', async () => {
    mockChat.mockResolvedValue('');

    const result = await explain(ITEM, PROFILE);

    expect(result).toBe('No explanation available.');
  });

  it('falls back to keyword-based explanation on groq error', async () => {
    mockChat.mockRejectedValue(new Error('Groq timeout'));

    const result = await explain(ITEM, PROFILE);

    expect(result).toContain('javascript');
  });
});

describe('generateFallbackExplanation', () => {
  it('lists matched keywords', () => {
    const result = generateFallbackExplanation(ITEM, PROFILE);
    expect(result).toContain('javascript');
  });

  it('lists missing keywords', () => {
    const item = { content: 'Only JavaScript here' };
    const profile = { keywords: ['javascript', 'python'] };
    const result = generateFallbackExplanation(item, profile);
    expect(result).toContain('python');
  });

  it('returns semantic similarity message when no keywords match', () => {
    const item = { content: 'Something completely unrelated' };
    const profile = { keywords: [] };
    const result = generateFallbackExplanation(item, profile);
    expect(result).toBe('Matched by semantic similarity.');
  });

  it('handles empty keywords array', () => {
    const result = generateFallbackExplanation(ITEM, { keywords: [] });
    expect(typeof result).toBe('string');
  });

  it('handles missing content in item', () => {
    const result = generateFallbackExplanation({}, { keywords: ['js'] });
    expect(result).toContain('js');
  });
});
