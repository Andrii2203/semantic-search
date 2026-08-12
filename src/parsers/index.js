'use strict';

const crypto = require('crypto');
const { extractTextFromPDF } = require('./pdf-extractor');
const { detectSections } = require('./section-detector');
const { extractSkills } = require('./skills-extractor');
const { parseExperience } = require('./experience-parser');
const { buildResumeIR } = require('./ir-builder');

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

async function parseResume(fileBuffer, fileName) {
  const rawText = await extractTextFromPDF(fileBuffer);
  
  const sections = detectSections(rawText);
  
  const skills = extractSkills(sections.skills || []);
  const experience = parseExperience(sections.experience || []);
  const education = (sections.education || []).join('\n');
  const languages = sections.languages || [];
  const summary = (sections.summary || []).join('\n');
  
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
