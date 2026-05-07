'use strict';

const { parseExperience } = require('../../src/parsers/experience-parser');

describe('experience-parser', () => {
  it('parses static years', () => {
    const lines = ['Google 2020 - 2023'];
    const result = parseExperience(lines);
    expect(result.totalYears).toBe(3);
    expect(result.experiences[0]).toMatchObject({
      yearsFrom: 2020,
      yearsTo: 2023,
      duration: 3
    });
  });

  it('parses present years', () => {
    const lines = ['Google 2021 - present'];
    const result = parseExperience(lines);
    const currentYear = new Date().getFullYear();
    const expectedDuration = currentYear - 2021;
    
    expect(result.totalYears).toBe(expectedDuration);
    expect(result.experiences[0]).toMatchObject({
      yearsFrom: 2021,
      yearsTo: currentYear,
      duration: expectedDuration
    });
  });

  it('parses multiple experiences and sums total years', () => {
    const lines = ['Company A 2018 - 2020', 'Company B 2020 to 2023'];
    const result = parseExperience(lines);
    expect(result.totalYears).toBe(5);
    expect(result.experiences).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(parseExperience([])).toEqual({ experiences: [], totalYears: 0 });
    expect(parseExperience(null)).toEqual({ experiences: [], totalYears: 0 });
  });

  it('ignores lines without dates', () => {
    const lines = ['Worked at Google', '2020 - 2023'];
    const result = parseExperience(lines);
    expect(result.experiences).toHaveLength(1);
    expect(result.totalYears).toBe(3);
  });

  it('correctly calculates total years with overlapping periods', () => {
    const lines = [
      'Company A 2018 - 2021', // 2018 to 2021
      'Freelance 2020 - 2022', // Overlaps A. Total spans 2018-2022 = 4 years
      'Company B 2023 - 2024'  // Non-overlapping. +1 year
    ];
    // Expected total: (2022 - 2018) + (2024 - 2023) = 4 + 1 = 5 years
    // Naive sum would be 3 + 2 + 1 = 6 years.
    const result = parseExperience(lines);
    expect(result.totalYears).toBe(5);
  });
});
