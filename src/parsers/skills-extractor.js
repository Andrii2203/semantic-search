'use strict';

const KNOWN_TECH = [
  'Node.js', 'Python', 'Java', 'Go', 'Rust', 'C#', '.NET', 'PHP',
  'Ruby', 'Django', 'Flask', 'Spring', 'Express', 'FastAPI',
  'React', 'Angular', 'Vue', 'Svelte', 'Next.js', 'TypeScript',
  'JavaScript', 'HTML', 'CSS', 'Redux', 'GraphQL',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform',
  'CI/CD', 'Jenkins', 'GitHub Actions', 'Ansible',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
  'SQL', 'NoSQL', 'DynamoDB',
  'React Native', 'Flutter', 'Kotlin', 'Swift',
  'Git', 'REST', 'gRPC', 'Microservices', 'Agile', 'Scrum',
  'Webpack', 'Vite', 'Jest', 'Cypress',
];

function extractSkills(skillsSectionLines) {
  if (!skillsSectionLines || skillsSectionLines.length === 0) { return [] };

  const text = skillsSectionLines.join(' ');
  const foundSkills = new Set();
  const lowerText = text.toLowerCase();
  
  for (const tech of KNOWN_TECH) {
    const lowerTech = tech.toLowerCase();
    
    let index = lowerText.indexOf(lowerTech);
    while (index !== -1) {
      const charBefore = index > 0 ? lowerText[index - 1] : ' ';
      const charAfter = index + lowerTech.length < lowerText.length ? lowerText[index + lowerTech.length] : ' ';
      
      const isAlphanumeric = /[a-z0-9]/;
      if (!isAlphanumeric.test(charBefore) && !isAlphanumeric.test(charAfter)) {
        foundSkills.add(tech);
        break;
      }
      index = lowerText.indexOf(lowerTech, index + 1);
    }
  }
  
  return Array.from(foundSkills);
}

module.exports = { extractSkills, KNOWN_TECH };
