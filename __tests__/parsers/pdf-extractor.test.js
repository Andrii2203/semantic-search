'use strict';

const { setPdfText, failNextParse, resetPdfFake } = require('pdf-parse');
const { AppError } = require('../../src/errors');
const { extractTextFromPDF, cleanText } = require('../../src/parsers/pdf-extractor');

describe('src/parsers/pdf-extractor.js', () => {
  afterEach(() => {
    resetPdfFake();
  });

  describe('cleanText', () => {
    test('collapses repeated spaces and blank lines into single separators', () => {
      const raw = 'Hello    World\n\n\nThis is a test\n  \nEnd';

      expect(cleanText(raw)).toBe('Hello World\nThis is a test\nEnd');
    });

    test('returns an empty string when the input is empty or null', () => {
      expect(cleanText('')).toBe('');
      expect(cleanText(null)).toBe('');
    });
  });

  describe('extractTextFromPDF', () => {
    test('rejects with AppError when the input is not a buffer', async () => {
      await expect(extractTextFromPDF('not a buffer')).rejects.toThrow(AppError);
      await expect(extractTextFromPDF('not a buffer')).rejects.toThrow(
        'Invalid input: Expected a Buffer containing PDF data.',
      );
      await expect(extractTextFromPDF(null)).rejects.toThrow(AppError);
    });

    test('returns the cleaned text of the parsed document', async () => {
      setPdfText('Mocked \n PDF   \n\n Content');

      const text = await extractTextFromPDF(Buffer.from('dummy'));

      expect(text).toBe('Mocked\nPDF\nContent');
    });

    test('rejects with AppError carrying the parser message when parsing fails', async () => {
      failNextParse('Corrupted file');

      await expect(extractTextFromPDF(Buffer.from('dummy'))).rejects.toThrow(AppError);
      await expect(extractTextFromPDF(Buffer.from('dummy'))).rejects.toThrow(
        'Failed to parse PDF: Corrupted file',
      );
    });
  });
});
