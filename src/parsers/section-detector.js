'use strict';

const SECTION_MARKERS = {
  experience: [
    'experience', 'work experience', 'employment', 'work history',
    'professional experience', 'career', 'positions held',
    'досвід', 'досвід роботи', 'трудовий досвід', 'кар\'єра',
    'опыт', 'опыт работы', 'трудовой опыт',
  ],
  skills: [
    'skills', 'technical skills', 'technologies', 'tech stack',
    'competencies', 'expertise', 'tools', 'proficiencies',
    'навички', 'технічні навички', 'володіння', 'інструменти',
    'навыки', 'технические навыки', 'владение',
  ],
  education: [
    'education', 'academic', 'university', 'degree', 'studies',
    'освіта', 'навчання', 'університет', 'диплом',
    'образование', 'учеба', 'университет',
  ],
  languages: [
    'languages', 'language skills', 'spoken languages',
    'мови', 'володіння мовами', 'іноземні мови',
    'языки', 'владение языками', 'иностранные языки',
  ],
  summary: [
    'summary', 'about', 'profile', 'objective', 'about me',
    'коротко', 'про себе', 'мета', 'ціль',
    'кратко', 'о себе', 'цель',
  ],
  contacts: [
    'contact', 'contacts', 'email', 'phone', 'linkedin', 'github',
    'контакти', 'телефон', 'пошта',
    'контакты', 'телефон', 'почта',
  ]
};

function looksLikeHeader(line) {
  const trimmed = line.trim();
  if (!trimmed) { return false };
  
  if (trimmed.length > 50) { return false };
  
  const sentenceIndicators = /\b(the|and|for|was|with|have|been|this|that|from|your|our)\b/i;
  if (sentenceIndicators.test(trimmed) && trimmed.split(/\s+/).length > 3) {
    return false;
  };
  
  return true;
}

function detectSections(text) {
  const sections = {
    header: [],
    experience: [],
    skills: [],
    education: [],
    languages: [],
    summary: [],
    contacts: [],
  };

  if (!text) { return sections };

  let currentSection = 'header';
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { continue };

    const normalized = trimmed.toLowerCase();
    const cleanForMatch = normalized.replace(/[:\-•·]/g, '').trim();
    
    let matchedSection = null;
    
    if (looksLikeHeader(trimmed)) {
      for (const [sectionName, markers] of Object.entries(SECTION_MARKERS)) {
        if (markers.includes(cleanForMatch)) {
          matchedSection = sectionName;
          break;
        }
      }
    }

    if (matchedSection && matchedSection !== currentSection) {
      currentSection = matchedSection;
    } else {
      sections[currentSection].push(trimmed);
    }
  }

  return sections;
}

module.exports = { detectSections, SECTION_MARKERS };
