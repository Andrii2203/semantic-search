'use strict';

const constants = require('../search-constants');

let loaded = null;

/* istanbul ignore next */
async function getModel() {
  if (!loaded) {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await import(
      '@huggingface/transformers'
    );
    loaded = {
      tokenizer: await AutoTokenizer.from_pretrained(constants.crossEncoderModel),
      model: await AutoModelForSequenceClassification.from_pretrained(constants.crossEncoderModel),
    };
  }
  return loaded;
}

/* istanbul ignore next */
async function scoreBatch(queryText, documents) {
  const { tokenizer, model } = await getModel();
  const inputs = await tokenizer(new Array(documents.length).fill(queryText), {
    text_pair: documents,
    padding: true,
    truncation: true,
  });
  const output = await model(inputs);

  return Array.from(output.logits.data);
}

/* istanbul ignore next */
async function scoreAll(queryText, documents) {
  const size = constants.crossEncoderBatchSize;
  const scores = [];

  for (let start = 0; start < documents.length; start += size) {
    scores.push(...(await scoreBatch(queryText, documents.slice(start, start + size))));
  }

  return scores;
}

module.exports = { scoreAll };
