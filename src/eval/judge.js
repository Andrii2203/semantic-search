'use strict';

const { getGroqClient } = require('../groq-client');
const constants = require('../search-constants');
const logger = require('../logger');

const PROMPT_VERSION = constants.judgePromptVersion;

const RUBRIC = [
  'You grade how well a news article answers what a person is interested in.',
  '3 = the article is squarely about what the person is interested in',
  '2 = the article is about the same subject, seen from a different angle',
  '1 = related subject, but it does not address what the person is interested in',
  '0 = a different subject',
  'Return only JSON: {"grade": <0-3>, "reason": "<one short sentence>"}',
].join('\n');

class JudgeTransportError extends Error {}
class JudgeUnparseableError extends Error {}
class JudgeGradeError extends Error {}

function buildMessages(intent, article) {
  return [
    { role: 'system', content: RUBRIC },
    {
      role: 'user',
      content:
        `INTERESTED IN:\n${intent.content.slice(0, constants.judgeIntentChars)}` +
        `\n\nARTICLE:\n${article.content.slice(0, constants.judgeArticleChars)}`,
    },
  ];
}

function parseGrade(raw) {
  let payload;
  try {
    payload = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  } catch {
    throw new JudgeUnparseableError(`judge returned no parseable JSON: ${String(raw).slice(0, 120)}`);
  }

  const grade = payload.grade;
  if (!Number.isInteger(grade) || grade < constants.gradeMin || grade > constants.gradeMax) {
    throw new JudgeGradeError(`judge returned a grade outside ${constants.gradeMin} to ${constants.gradeMax}: ${grade}`);
  }

  return { grade, reason: String(payload.reason || '').trim() };
}

let spendUsd = 0;

function getSpend() {
  return spendUsd;
}

function userContent(intent, article) {
  return (
    `INTERESTED IN:\n${intent.content.slice(0, constants.judgeIntentChars)}` +
    `\n\nARTICLE:\n${article.content.slice(0, constants.judgeArticleChars)}`
  );
}

async function callAnthropic(intent, article, model) {
  const { gradePair } = require('../anthropic-client');
  const result = await gradePair({
    system: RUBRIC,
    user: userContent(intent, article),
    model,
  });
  spendUsd += result.cost;
  return result.text;
}

async function callGroq(intent, article, model) {
  return getGroqClient().chat(buildMessages(intent, article), {
    model,
    temperature: constants.judgeTemperature,
    maxTokens: constants.judgeMaxTokens,
  });
}

async function judgePair(intent, article, options = {}) {
  const model = options.model || constants.judgeModel;
  const provider = options.provider || constants.judgeProvider;
  let raw;

  try {
    raw =
      provider === 'anthropic'
        ? await callAnthropic(intent, article, model)
        : await callGroq(intent, article, model);
  } catch (err) {
    throw new JudgeTransportError(`judge call failed: ${err.message}`);
  }

  const { grade, reason } = parseGrade(raw);

  return {
    intentId: intent.id,
    articleId: article.id,
    grade,
    reason,
    model,
    promptVersion: PROMPT_VERSION,
    judgedAt: new Date().toISOString(),
  };
}

function keyOf(intentId, articleId) {
  return `${intentId}::${articleId}`;
}

function indexExisting(existing, model) {
  const index = new Map();
  for (const judgment of existing || []) {
    if (judgment.model === model && judgment.promptVersion === PROMPT_VERSION) {
      index.set(keyOf(judgment.intentId, judgment.articleId), judgment);
    }
  }
  return index;
}

async function judgeAll(pairs, existing = [], options = {}) {
  const model = options.model || constants.judgeModel;
  const done = indexExisting(existing, model);
  const results = [];
  const failures = [];

  for (const { intent, article } of pairs) {
    const known = done.get(keyOf(intent.id, article.id));
    if (known) {
      results.push(known);
      continue;
    }

    try {
      const judgment = await judgePair(intent, article, options);
      results.push(judgment);
      if (options.onJudged) {
        options.onJudged(judgment, results.length, pairs.length);
      }
    } catch (err) {
      failures.push({ intentId: intent.id, articleId: article.id, error: err.name, message: err.message });
      logger.warn({ intentId: intent.id, articleId: article.id, error: err.name }, 'Judge pair failed');
    }
  }

  results.failures = failures;
  return results;
}

module.exports = {
  judgePair,
  judgeAll,
  parseGrade,
  getSpend,
  PROMPT_VERSION,
  RUBRIC,
  JudgeTransportError,
  JudgeUnparseableError,
  JudgeGradeError,
};
