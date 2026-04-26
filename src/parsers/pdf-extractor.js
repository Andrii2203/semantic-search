'use strict';

const pdfParse = require('pdf-parse');
const { AppError, ErrorCodes } = require('../errors');

/**
 * Cleans the raw text extracted from PDF
 * @param {string} text 
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  if (!text) return '';
  return text
    // Fix common PDF encoding issues
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Replace non-breaking spaces and zero-width characters
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Collapse multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Collapse multiple spaces (but keep newlines)
    .replace(/[^\S\n]+/g, ' ')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Extracts raw text from a PDF Buffer
 * @param {Buffer} fileBuffer 
 * @returns {Promise<string>} Cleaned text
 */
async function extractTextFromPDF(fileBuffer) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new AppError('Invalid input: Expected a Buffer containing PDF data.', ErrorCodes.VALIDATION_FAILED, 400);
  }

  try {
    const data = await pdfParse(fileBuffer);
    return cleanText(data.text);
  } catch (error) {
    throw new AppError(`Failed to parse PDF: ${error.message}`, ErrorCodes.VALIDATION_FAILED, 400);
  }
}

module.exports = {
  extractTextFromPDF,
  cleanText
};
