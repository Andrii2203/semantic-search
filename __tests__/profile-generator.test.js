'use strict';

jest.mock('../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const mockExtractKeywords = jest.fn();
const mockExtractKeywordsFallback = jest.fn();
jest.mock('../src/keyword-extractor', () => ({
  extractKeywords: mockExtractKeywords,
  extractKeywordsFallback: mockExtractKeywordsFallback,
}));

jest.mock('../src/search-engine');
jest.mock('../src/db');

const SearchEngine = require('../src/search-engine');
const db = require('../src/db');
const { fromText, loadProfile } = require('../src/profile-generator');

const LONG_INPUT = 'Looking for a Senior JavaScript developer with Node.js experience';

beforeEach(() => {
  jest.clearAllMocks();
  mockExtractKeywordsFallback.mockReturnValue(['javascript', 'nodejs']);
  mockExtractKeywords.mockResolvedValue(['javascript', 'nodejs', 'senior']);
  SearchEngine.generateEmbedding.mockResolvedValue(new Array(384).fill(0.1));
  SearchEngine.serializeVector.mockReturnValue(Buffer.alloc(4));
  db.getProfile.mockReturnValue(null);
  db.saveProfile.mockReturnValue('test-profile-id');
});

// ═══════════════════════════════════════════════════════════════
// fromText
// ═══════════════════════════════════════════════════════════════

describe('fromText', () => {
  it('throws when input is too short', async () => {
    await expect(fromText('hi')).rejects.toThrow();
  });

  it('throws when input is empty string', async () => {
    await expect(fromText('')).rejects.toThrow();
  });

  it('throws when input is null', async () => {
    await expect(fromText(null)).rejects.toThrow();
  });

  it('returns profile with AI keywords when useAI=true (default)', async () => {
    const profile = await fromText(LONG_INPUT);

    expect(mockExtractKeywords).toHaveBeenCalledWith(LONG_INPUT);
    expect(profile.keywords).toEqual(['javascript', 'nodejs', 'senior']);
    expect(profile.id).toMatch(/^prof_/);
    expect(profile.rawInput).toBe(LONG_INPUT);
  });

  it('uses fallback keywords when useAI=false', async () => {
    const profile = await fromText(LONG_INPUT, { useAI: false });

    expect(mockExtractKeywords).not.toHaveBeenCalled();
    expect(profile.keywords).toEqual(['javascript', 'nodejs']);
  });

  it('falls back to extractKeywordsFallback when AI throws', async () => {
    mockExtractKeywords.mockRejectedValue(new Error('AI error'));

    const profile = await fromText(LONG_INPUT);

    expect(profile.keywords).toEqual(['javascript', 'nodejs']);
  });

  it('keeps fallback keywords when AI returns empty array', async () => {
    mockExtractKeywords.mockResolvedValue([]);

    const profile = await fromText(LONG_INPUT);

    expect(profile.keywords).toEqual(['javascript', 'nodejs']); // fallback kept
  });

  it('returns profile with null vector when embedding fails', async () => {
    SearchEngine.generateEmbedding.mockRejectedValue(new Error('ONNX fail'));

    const profile = await fromText(LONG_INPUT);

    expect(profile.vector).toBeNull();
  });

  it('saves profile to DB when save=true', async () => {
    await fromText(LONG_INPUT, { save: true });

    expect(db.saveProfile).toHaveBeenCalled();
  });

  it('does not save profile when save=false (default)', async () => {
    await fromText(LONG_INPUT);

    expect(db.saveProfile).not.toHaveBeenCalled();
  });

  it('returns deterministic ID for same input', async () => {
    const p1 = await fromText(LONG_INPUT);
    const p2 = await fromText(LONG_INPUT);

    expect(p1.id).toBe(p2.id);
  });
});

// ═══════════════════════════════════════════════════════════════
// loadProfile
// ═══════════════════════════════════════════════════════════════

describe('loadProfile', () => {
  it('returns profile from DB', () => {
    const mockProfile = { id: 'test', keywords: ['js'], vector: null, rawInput: 'js' };
    db.getProfile.mockReturnValue(mockProfile);

    const result = loadProfile('test');

    expect(result).toEqual(mockProfile);
  });

  it('throws when profile not found', () => {
    db.getProfile.mockReturnValue(null);

    expect(() => loadProfile('nonexistent')).toThrow();
  });
});
