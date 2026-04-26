'use strict';

const { extractSkills } = require('../../src/parsers/skills-extractor');

describe('skills-extractor', () => {
  it('extracts skills from a comma-separated string', () => {
    const lines = ['Node.js, React, AWS'];
    const skills = extractSkills(lines);
    expect(skills).toEqual(expect.arrayContaining(['Node.js', 'React', 'AWS']));
    expect(skills).toHaveLength(3);
  });

  it('extracts skills from a mixed ukrainian/english text', () => {
    const lines = ['Досвід роботи з PostgreSQL та MongoDB'];
    const skills = extractSkills(lines);
    expect(skills).toEqual(expect.arrayContaining(['PostgreSQL', 'MongoDB']));
  });

  it('handles edge cases with symbols like C# and .NET', () => {
    const lines = ['I use C# and .NET for backend development'];
    const skills = extractSkills(lines);
    expect(skills).toEqual(expect.arrayContaining(['C#', '.NET']));
  });

  it('does not extract partial matches', () => {
    // "Reacting" should not match "React", "java" inside "javascript" should not match "Java"
    const lines = ['Reacting to events in javascript'];
    const skills = extractSkills(lines);
    expect(skills).toEqual(['JavaScript']); // Only JavaScript should match, not Java or React
  });

  it('returns empty array for empty input', () => {
    expect(extractSkills([])).toEqual([]);
    expect(extractSkills([''])).toEqual([]);
    expect(extractSkills(null)).toEqual([]);
  });
});
