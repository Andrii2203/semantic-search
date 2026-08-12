'use strict';

const { failNextParse, resetPdfFake } = require('pdf-parse');
const { parseResume, parseDocument } = require('../../src/parsers');
const { AppError } = require('../../src/errors');
const { validateIR } = require('../../src/validation');

function pdfBufferWithText(text) {
  const buffer = Buffer.from('pdf');
  buffer.pdfText = text;
  return buffer;
}

const fullResume = `
John Doe
john@example.com

SKILLS
JavaScript, Node.js, Python, React

EXPERIENCE
Senior Developer at Google
2020 - Present
- Built scalable systems

EDUCATION
BS Computer Science, Stanford University

LANGUAGES
English, Spanish

SUMMARY
Experienced full-stack developer with 8 years in the industry.
`.trim();

describe('src/parsers/index.js', () => {
  afterEach(() => {
    resetPdfFake();
  });

  describe('parseResume', () => {
    test('returns an IR object carrying the file name and the extracted text', async () => {
      const result = await parseResume(pdfBufferWithText(fullResume), 'john-doe.pdf');

      expect(result.metadata.fileName).toBe('john-doe.pdf');
      expect(result.content).toContain('John Doe');
      expect(result.type).toBe('resume');
    });

    test('extracts skills, experience, education and languages from a full resume', async () => {
      const result = await parseResume(pdfBufferWithText(fullResume), 'john-doe.pdf');

      expect(result.metadata.skills).toEqual(expect.arrayContaining(['JavaScript', 'Python']));
      expect(result.metadata.experienceCount).toBeGreaterThan(0);
      expect(result.metadata.education).toContain('Stanford');
      expect(result.metadata.languages.length).toBeGreaterThan(0);
      expect(result.metadata.summary).toContain('full-stack');
    });

    test('returns empty metadata fields when the document has no recognisable sections', async () => {
      const result = await parseResume(pdfBufferWithText('nothing useful here'), 'empty.pdf');

      expect(result.metadata.fileName).toBe('empty.pdf');
      expect(result.metadata.skills).toEqual([]);
      expect(result.metadata.experienceCount).toBe(0);
      expect(result.metadata.education).toBe('');
      expect(result.metadata.languages).toEqual([]);
      expect(result.metadata.summary).toBe('');
    });

    test('extracts skills and no experience when only a skills section is present', async () => {
      const text = 'SKILLS\nJavaScript, Python\n\nSome other text';

      const result = await parseResume(pdfBufferWithText(text), 'skills-only.pdf');

      expect(result.metadata.skills.length).toBeGreaterThan(0);
      expect(result.metadata.experienceCount).toBe(0);
    });

    test('extracts experience and no skills when only an experience section is present', async () => {
      const text = 'EXPERIENCE\nDeveloper at Corp\n2020-2022\n- Did things';

      const result = await parseResume(pdfBufferWithText(text), 'exp-only.pdf');

      expect(result.metadata.experienceCount).toBeGreaterThan(0);
      expect(result.metadata.skills).toEqual([]);
    });

    test('rejects with AppError when the underlying parser fails', async () => {
      failNextParse('PDF corrupted');

      await expect(parseResume(Buffer.from('bad'), 'corrupt.pdf')).rejects.toThrow(AppError);
    });

    test('produces an object that passes IR validation', async () => {
      const result = await parseResume(pdfBufferWithText(fullResume), 'valid.pdf');

      const validation = validateIR(result);

      expect(validation.success).toBe(true);
    });
  });

  describe('parseDocument', () => {
    test('returns a generic document IR without resume metadata', async () => {
      const result = await parseDocument(pdfBufferWithText('A book about ships'), 'book.pdf');

      expect(result.type).toBe('document');
      expect(result.content).toBe('A book about ships');
      expect(result.metadata.fileName).toBe('book.pdf');
      expect(result.metadata.skills).toBeUndefined();
    });

    test('derives a stable id from content and file name', async () => {
      const first = await parseDocument(pdfBufferWithText('same content'), 'a.pdf');
      const second = await parseDocument(pdfBufferWithText('same content'), 'a.pdf');
      const third = await parseDocument(pdfBufferWithText('same content'), 'b.pdf');

      expect(first.id).toBe(second.id);
      expect(third.id).not.toBe(first.id);
    });
  });
});
