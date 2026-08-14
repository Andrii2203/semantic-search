'use strict';

function gain(grade) {
  return 2 ** grade - 1;
}

function discount(rank) {
  return Math.log2(rank + 1);
}

function gradeOf(judgments, documentId) {
  const grade = judgments[documentId];
  return typeof grade === 'number' && grade > 0 ? grade : 0;
}

function discountedCumulativeGain(grades) {
  return grades.reduce((total, grade, index) => total + gain(grade) / discount(index + 1), 0);
}

function idealGrades(judgments, k) {
  return Object.values(judgments)
    .filter((grade) => typeof grade === 'number' && grade > 0)
    .sort((first, second) => second - first)
    .slice(0, k);
}

function ndcgAtK(ranking, judgments, k) {
  const retrieved = ranking.slice(0, k).map((documentId) => gradeOf(judgments, documentId));
  const ideal = discountedCumulativeGain(idealGrades(judgments, k));

  return ideal === 0 ? 0 : discountedCumulativeGain(retrieved) / ideal;
}

function recallAtK(ranking, judgments, k) {
  const relevant = idealGrades(judgments, Number.MAX_SAFE_INTEGER).length;
  if (relevant === 0) {
    return 0;
  }

  const found = ranking
    .slice(0, k)
    .filter((documentId) => gradeOf(judgments, documentId) > 0).length;

  return found / relevant;
}

module.exports = { ndcgAtK, recallAtK };
