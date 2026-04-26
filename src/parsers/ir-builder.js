'use strict';

const crypto = require('crypto');

/**
 * Builds the final Intermediate Representation (IR) object for a resume.
 * @param {object} params
 * @param {string} params.fileName
 * @param {string} params.rawText
 * @param {string[]} params.skills
 * @param {object} params.experience
 * @param {string} params.education
 * @param {string[]|string} params.languages
 * @param {string} params.summary
 * @returns {object} IR object
 */
function buildResumeIR({ fileName, rawText, skills, experience, education, languages, summary }) {
  const content = rawText || '';
  const id = crypto.createHash('sha256').update(content + fileName).digest('hex').slice(0, 16);

  let parsedLanguages = [];
  if (Array.isArray(languages)) {
    parsedLanguages = languages;
  } else if (typeof languages === 'string' && languages.trim()) {
    parsedLanguages = [languages.trim()];
  }

  const hasEnglish = parsedLanguages.some(l => /english|англійська|английский/i.test(l)) || 
                     /english|англійська|английский/i.test(content);

  return {
    id,
    content,
    type: 'resume',
    source: 'file-upload',
    metadata: {
      fileName: fileName || 'unknown.pdf',
      skills: Array.isArray(skills) ? skills : [],
      totalYears: experience?.totalYears || 0,
      experienceCount: experience?.experiences?.length || 0,
      hasEnglish,
      education: typeof education === 'string' ? education.trim() : (education || []).join('\n').trim(),
      summary: typeof summary === 'string' ? summary.trim() : (summary || []).join('\n').trim(),
      languages: parsedLanguages,
      uploadedAt: new Date().toISOString()
    }
  };
}

module.exports = { buildResumeIR };
