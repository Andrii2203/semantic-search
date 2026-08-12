'use strict';

const crypto = require('crypto');
const { extractTextFromPDF } = require('./pdf-extractor');
const { detectSections } = require('./section-detector');
const { extractSkills } = require('./skills-extractor');
const { parseExperience } = require('./experience-parser');
const { buildResumeIR } = require('./ir-builder');

/**
 * Generic document parser: any PDF (book, research, paper, etc.) → IR.
 * Just extracts text — no resume-specific structure. parseResume is the
 * specialization for the HR vertical.
 * @param {Buffer} fileBuffer
 * @param {string} fileName
 * @returns {Promise<object>} IR object (type 'document')
 */
async function parseDocument(fileBuffer, fileName) {
  const content = await extractTextFromPDF(fileBuffer);
  const id = crypto.createHash('sha256').update(content + (fileName || '')).digest('hex').slice(0, 16);
  return {
    id,
    content,
    type: 'document',
    source: 'file-upload',
    metadata: {
      fileName: fileName || 'unknown.pdf',
      title: fileName ? fileName.replace(/\.[^.]+$/, '') : 'Document',
      uploadedAt: new Date().toISOString(),
    },
  };
}

/**
 * Parses a PDF resume buffer and builds an IR object.
 * @param {Buffer} fileBuffer The raw PDF buffer
 * @param {string} fileName The original filename
 * @returns {Promise<object>} The resulting IR object
 */
async function parseResume(fileBuffer, fileName) {
  // 1. Extract & Clean
  const rawText = await extractTextFromPDF(fileBuffer);
  
  // 2. Structure
  const sections = detectSections(rawText);
  
  // 3. Extract data
  const skills = extractSkills(sections.skills || []);
  const experience = parseExperience(sections.experience || []);
  const education = (sections.education || []).join('\n');
  const languages = sections.languages || [];
  const summary = (sections.summary || []).join('\n');
  
  // 4. Build IR
  return buildResumeIR({
    fileName,
    rawText,
    skills,
    experience,
    education,
    languages,
    summary
  });
}

module.exports = { parseResume, parseDocument };
