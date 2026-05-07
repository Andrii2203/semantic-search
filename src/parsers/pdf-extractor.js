'use strict';

const pdfParse = require('pdf-parse');
const { AppError, ErrorCodes } = require('../errors');

/**
 * Cleans the raw text extracted from PDF
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Extracts raw text from a PDF Buffer
 */
async function extractTextFromPDF(fileBuffer) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new AppError(
      'Invalid input: Expected a Buffer containing PDF data.',
      ErrorCodes.VALIDATION_FAILED,
      400
    );
  }

  try {
    const result = await pdfParse(fileBuffer);
    return cleanText(result.text);
  } catch (error) {
    throw new AppError(
      `Failed to parse PDF: ${error.message}`,
      ErrorCodes.VALIDATION_FAILED,
      400
    );
  }
}

module.exports = { extractTextFromPDF, cleanText };