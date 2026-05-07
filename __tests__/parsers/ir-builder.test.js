'use strict';

const { buildResumeIR } = require('../../src/parsers/ir-builder');

describe('ir-builder', () => {
  it('builds a full IR object', () => {
    const ir = buildResumeIR({
      fileName: 'resume.pdf',
      rawText: 'Full text here. Speaks English.',
      skills: ['Node.js', 'React'],
      experience: { experiences: [{}], totalYears: 3 },
      education: 'MIT',
      languages: ['Ukrainian', 'English'],
      summary: 'A great dev'
    });

    expect(ir.id).toBeDefined();
    expect(ir.content).toBe('Full text here. Speaks English.');
    expect(ir.type).toBe('resume');
    expect(ir.source).toBe('file-upload');
    expect(ir.metadata.fileName).toBe('resume.pdf');
    expect(ir.metadata.skills).toEqual(['Node.js', 'React']);
    expect(ir.metadata.totalYears).toBe(3);
    expect(ir.metadata.experienceCount).toBe(1);
    expect(ir.metadata.hasEnglish).toBe(true);
    expect(ir.metadata.education).toBe('MIT');
    expect(ir.metadata.languages).toEqual(['Ukrainian', 'English']);
    expect(ir.metadata.uploadedAt).toBeDefined();
  });

  it('builds a minimal IR object when fields are missing', () => {
    const ir = buildResumeIR({
      fileName: 'test.pdf',
      rawText: ''
    });

    expect(ir.content).toBe('');
    expect(ir.metadata.skills).toEqual([]);
    expect(ir.metadata.totalYears).toBe(0);
    expect(ir.metadata.hasEnglish).toBe(false);
  });
});
