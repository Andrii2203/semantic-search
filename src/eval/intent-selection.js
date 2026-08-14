'use strict';

const constants = require('../search-constants');

const MINIMUM_RELEVANT = 3;

function relevantCount(judgments) {
  return [...judgments.values()].filter((grade) => grade >= constants.gradeRelevantThreshold).length;
}

function pruneIntents(intents, qrels) {
  return intents
    .filter((intent) => qrels.has(intent.id))
    .map((intent) => ({ intent, relevant: relevantCount(qrels.get(intent.id)) }))
    .filter((row) => row.relevant >= MINIMUM_RELEVANT || row.relevant === 0)
    .map((row) => ({
      ...row.intent,
      group: row.relevant === 0 ? 'unanswerable' : 'answerable',
      relevant: row.relevant,
    }));
}

function assignSplits(intents) {
  const groups = new Map();

  for (const intent of intents) {
    if (!groups.has(intent.group)) {
      groups.set(intent.group, []);
    }
    groups.get(intent.group).push(intent);
  }

  const assigned = [];
  for (const members of groups.values()) {
    members.forEach((intent, index) => {
      assigned.push({ ...intent, split: index % 3 === 2 ? 'locked' : 'dev' });
    });
  }

  return assigned.sort((first, second) => first.id.localeCompare(second.id));
}

module.exports = { pruneIntents, assignSplits, MINIMUM_RELEVANT };
