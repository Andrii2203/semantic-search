'use strict';

const pdfParse = require('pdf-parse');
const { AppError, ErrorCodes } = require('../../src/errors');
const { extractTextFromPDF, cleanText } = require('../../src/parsers/pdf-extractor');

jest.mock('pdf-parse', () => jest.fn());

describe('pdf-extractor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanText', () => {
    it('removes excessive newlines and spaces', () => {
      const raw = 'Hello    World\n\n\nThis is a test\n  \nEnd';
      const expected = 'Hello World\nThis is a test\nEnd';
      expect(cleanText(raw)).toBe(expected);
    });

    it('handles empty or null input', () => {
      expect(cleanText('')).toBe('');
      expect(cleanText(null)).toBe('');
    });
  });

  describe('extractTextFromPDF', () => {
    it('throws AppError if input is not a buffer', async () => {
      await expect(extractTextFromPDF('not a buffer')).rejects.toThrow(AppError);
      await expect(extractTextFromPDF('not a buffer')).rejects.toThrow('Invalid input: Expected a Buffer containing PDF data.');
      
      await expect(extractTextFromPDF(null)).rejects.toThrow(AppError);
    });

    it('extracts and cleans text from valid pdf buffer', async () => {
      pdfParse.mockResolvedValue({ text: 'Mocked \n PDF   \n\n Content' });
      const dummyBuffer = Buffer.from('dummy');
      const text = await extractTextFromPDF(dummyBuffer);
      
      expect(pdfParse).toHaveBeenCalledWith(dummyBuffer);
      expect(text).toBe('Mocked\nPDF\nContent');
    });

    it('throws custom AppError if pdf-parse fails', async () => {
      pdfParse.mockRejectedValue(new Error('Corrupted file'));
      const dummyBuffer = Buffer.from('dummy');
      
      await expect(extractTextFromPDF(dummyBuffer)).rejects.toThrow(AppError);
      await expect(extractTextFromPDF(dummyBuffer)).rejects.toThrow('Failed to parse PDF: Corrupted file');
    });
  });
});
