'use strict';

const path = require('path');

const realPdfParse = require(path.join(__dirname, '..', '..', 'node_modules', 'pdf-parse'));
const fakePdfParse = require('pdf-parse');

describe('boundary contract: pdf-parse', () => {
  test('the real library exports PDFParse as a constructor', () => {
    expect(typeof realPdfParse.PDFParse).toBe('function');
    expect(typeof realPdfParse.PDFParse.prototype.getText).toBe('function');
    expect(typeof realPdfParse.PDFParse.prototype.destroy).toBe('function');
  });

  test('the fake exposes the same shape as the real library', () => {
    expect(typeof fakePdfParse.PDFParse).toBe('function');
    expect(typeof fakePdfParse.PDFParse.prototype.getText).toBe('function');
    expect(typeof fakePdfParse.PDFParse.prototype.destroy).toBe('function');
  });

  test('the fake resolves getText to an object carrying text', async () => {
    const parser = new fakePdfParse.PDFParse({ data: Buffer.from('anything') });

    const result = await parser.getText();

    expect(typeof result.text).toBe('string');
  });
});
