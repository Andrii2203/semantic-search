'use strict';

const { detectSections } = require('../../src/parsers/section-detector');

describe('section-detector', () => {
  it('detects standard english resume sections', () => {
    const text = `
John Doe
Software Engineer
Summary
A great engineer.
Experience
Google 2020 - Present
Did some coding.
Education
MIT
Skills
Node.js, React
    `.trim();

    const sections = detectSections(text);
    
    expect(sections.header).toContain('John Doe');
    expect(sections.header).toContain('Software Engineer');
    
    expect(sections.summary).toContain('A great engineer.');
    expect(sections.experience).toContain('Google 2020 - Present');
    expect(sections.experience).toContain('Did some coding.');
    expect(sections.education).toContain('MIT');
    expect(sections.skills).toContain('Node.js, React');
  });

  it('detects ukrainian resume sections', () => {
    const text = `
Іван Іванов
Досвід роботи
Компанія
Освіта
КНУ
Навички
Node.js
    `.trim();

    const sections = detectSections(text);
    expect(sections.header).toContain('Іван Іванов');
    expect(sections.experience).toContain('Компанія');
    expect(sections.education).toContain('КНУ');
    expect(sections.skills).toContain('Node.js');
  });

  it('returns empty array for missing skills section', () => {
    const text = `
John
Experience
Work
    `.trim();

    const sections = detectSections(text);
    expect(sections.skills).toEqual([]);
    expect(sections.experience).toContain('Work');
  });

  it('returns all text in header if no sections found (creative resume)', () => {
    const text = `Hello world
I am a developer
My history is unique`;

    const sections = detectSections(text);
    expect(sections.header).toEqual(['Hello world', 'I am a developer', 'My history is unique']);
    expect(sections.skills).toHaveLength(0);
    expect(sections.experience).toHaveLength(0);
  });

  it('handles empty text without crashing', () => {
    const sections = detectSections('');
    expect(sections.header).toHaveLength(0);
    expect(sections.skills).toHaveLength(0);
  });

  it('does not confuse sentences containing section markers with headers', () => {
    const text = `
Header Name
I have a lot of experience with JavaScript and React.
Skills
Node.js
    `.trim();

    const sections = detectSections(text);
    // The sentence contains "experience", but it's a sentence, so it shouldn't be a header
    expect(sections.header).toContain('I have a lot of experience with JavaScript and React.');
    expect(sections.skills).toContain('Node.js');
    expect(sections.experience).toHaveLength(0);
  });
});
