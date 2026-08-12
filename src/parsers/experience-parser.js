'use strict';

const DATE_PATTERN = /(\d{4})\s*[-–—to]+\s*(present|тепер|настоящее|по настоящее|current)/i;
const DATE_PATTERN_STATIC = /(\d{4})\s*[-–—to]+\s*(\d{4})/i;

function parseExperience(experienceSectionLines) {
  if (!experienceSectionLines || experienceSectionLines.length === 0) {
    return { experiences: [], totalYears: 0 };
  }

  const currentYear = new Date().getFullYear();
  const experiences = [];

  for (const line of experienceSectionLines) {
    let yearsFrom = null;
    let yearsTo = null;
    let duration = 0;

    const matchPresent = line.match(DATE_PATTERN);
    const matchStatic = line.match(DATE_PATTERN_STATIC);

    if (matchPresent) {
      yearsFrom = parseInt(matchPresent[1], 10);
      yearsTo = currentYear;
      duration = yearsTo - yearsFrom;
    } else if (matchStatic) {
      yearsFrom = parseInt(matchStatic[1], 10);
      yearsTo = parseInt(matchStatic[2], 10);
      duration = yearsTo - yearsFrom;
    }

    if (yearsFrom !== null && duration >= 0 && duration <= 50) {
      experiences.push({
        rawText: line.trim(),
        yearsFrom,
        yearsTo,
        duration
      });
    }
  }

  let totalYears = 0;
  if (experiences.length > 0) {
    const intervals = experiences.map(exp => [exp.yearsFrom, exp.yearsTo]);
    intervals.sort((a, b) => a[0] - b[0]);

    let currentInterval = [...intervals[0]];
    const mergedIntervals = [currentInterval];

    for (let i = 1; i < intervals.length; i++) {
      const nextInterval = intervals[i];
      if (nextInterval[0] <= currentInterval[1]) {
        currentInterval[1] = Math.max(currentInterval[1], nextInterval[1]);
      } else {
        currentInterval = [...nextInterval];
        mergedIntervals.push(currentInterval);
      }
    }

    totalYears = mergedIntervals.reduce((sum, interval) => sum + (interval[1] - interval[0]), 0);
  }

  return { experiences, totalYears };
}

module.exports = { parseExperience };
