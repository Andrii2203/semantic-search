'use strict';

const { extractTextFromPDF } = require('./pdf-extractor');
const { detectSections } = require('./section-detector');
const { extractSkills } = require('./skills-extractor');
const { parseExperience } = require('./experience-parser');
const { buildResumeIR } = require('./ir-builder');

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

module.exports = { parseResume };
