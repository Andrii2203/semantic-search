'use strict';

const constants = require('../search-constants');

function seededRandom(seed) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function differences(first, second) {
  if (first.length !== second.length) {
    throw new Error(
      `the two configurations were scored on different queries: ${first.length} against ${second.length}`,
    );
  }

  return first.map((row, index) => {
    if (row.queryId !== second[index].queryId) {
      throw new Error(
        `the two configurations were scored on different queries: ${row.queryId} against ${second[index].queryId}`,
      );
    }
    return row.value - second[index].value;
  });
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function resampleMean(deltas, random) {
  let total = 0;
  for (let index = 0; index < deltas.length; index += 1) {
    total += deltas[Math.floor(random() * deltas.length)];
  }
  return total / deltas.length;
}

function quantile(sorted, share) {
  const position = Math.min(sorted.length - 1, Math.max(0, Math.round(share * (sorted.length - 1))));
  return sorted[position];
}

function pairedBootstrap(first, second, options = {}) {
  const deltas = differences(first, second);
  const resamples = options.resamples || constants.bootstrapResamples;
  const alpha = options.alpha === undefined ? constants.bootstrapAlpha : options.alpha;
  const random = seededRandom(options.seed === undefined ? constants.bootstrapSeed : options.seed);

  const means = [];
  for (let index = 0; index < resamples; index += 1) {
    means.push(resampleMean(deltas, random));
  }
  means.sort((left, right) => left - right);

  return {
    difference: mean(deltas),
    lower: quantile(means, alpha / 2),
    upper: quantile(means, 1 - alpha / 2),
    winRate: means.filter((value) => value > 0).length / resamples,
    queries: deltas.length,
    resamples,
  };
}

function compare(first, second, options = {}) {
  return first.metrics.map((metric) => ({
    metric: metric.name,
    first: first.configuration,
    second: second.configuration,
    firstValue: metric.value,
    secondValue: second.metrics.find((row) => row.name === metric.name).value,
    ...pairedBootstrap(first.perQuery[metric.name], second.perQuery[metric.name], options),
  }));
}

module.exports = { pairedBootstrap, compare, seededRandom };
