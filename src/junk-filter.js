'use strict';

const MIN_WORDS_TO_JUDGE = 20;
const MIN_DISTINCT_RATIO = 0.5;

function words(text) {
  return (text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function isKeywordStuffed(text) {
  const all = words(text);
  if (all.length < MIN_WORDS_TO_JUDGE) {
    return false;
  }

  const distinct = new Set(all).size;
  return distinct / all.length < MIN_DISTINCT_RATIO;
}

module.exports = { isKeywordStuffed, MIN_WORDS_TO_JUDGE, MIN_DISTINCT_RATIO };
