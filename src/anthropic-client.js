'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const constants = require('./search-constants');
const logger = require('./logger');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

function resetClient() {
  client = null;
}

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    grade: { type: 'integer', enum: [0, 1, 2, 3] },
    reason: { type: 'string' },
  },
  required: ['grade', 'reason'],
  additionalProperties: false,
};

function usageCost(usage) {
  if (!usage) {
    return 0;
  }
  const input = (usage.input_tokens || 0) * constants.judgeInputCostPerMillion;
  const output = (usage.output_tokens || 0) * constants.judgeOutputCostPerMillion;
  return (input + output) / 1_000_000;
}

async function gradePair({ system, user, model }) {
  const response = await getClient().messages.create({
    model: model || constants.judgeModel,
    max_tokens: constants.judgeMaxTokens,
    temperature: constants.judgeTemperature,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: GRADE_SCHEMA } },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`judge refused: ${response.stop_details?.category || 'unknown'}`);
  }

  const block = response.content.find((entry) => entry.type === 'text');
  if (!block) {
    throw new Error(`judge returned no text block, stop_reason ${response.stop_reason}`);
  }

  logger.debug({ cost: usageCost(response.usage) }, 'Judge call complete');

  return { text: block.text, cost: usageCost(response.usage), usage: response.usage };
}

module.exports = { gradePair, getClient, resetClient, usageCost, GRADE_SCHEMA };
