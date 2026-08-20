'use strict';

const fs = require('fs');
const path = require('path');

const constants = require('../search-constants');
const { batchFor, withPrefix, slugFor } = require('../models');

const pipelines = new Map();

/* istanbul ignore next */
async function getModel(model) {
  if (!pipelines.has(model)) {
    const { pipeline: createPipeline } = await import('@huggingface/transformers');
    pipelines.set(model, await createPipeline('feature-extraction', model));
  }
  return pipelines.get(model);
}

/* istanbul ignore next */
async function embedBatch(texts, side, model) {
  const encoder = await getModel(model);
  const prefixed = texts.map((text) => withPrefix(text, side, model));
  const output = await encoder(prefixed, { pooling: 'mean', normalize: true });
  const width = output.dims[output.dims.length - 1];

  return texts.map((_, index) =>
    Array.from(output.data.slice(index * width, (index + 1) * width)),
  );
}

/* istanbul ignore next */
async function embedMany(texts, options = {}) {
  const model = options.model || constants.embeddingModel;
  const size = batchFor(model);
  const vectors = [];

  for (let start = 0; start < texts.length; start += size) {
    vectors.push(...(await embedBatch(texts.slice(start, start + size), 'document', model)));
    if (options.onProgress) {
      options.onProgress(Math.min(start + size, texts.length), texts.length);
    }
  }

  return vectors;
}

/* istanbul ignore next */
function embedOne(text, side = 'query', model = constants.embeddingModel) {
  return embedBatch([text], side, model).then((vectors) => vectors[0]);
}

function cacheFile(directory, key) {
  const model = key.model || constants.embeddingModel;
  return path.join(directory, `vectors-${slugFor(model)}-${key.fields.join('-')}.bin`);
}

function loadVectors(directory, ids, key) {
  const file = cacheFile(directory, key);
  if (!fs.existsSync(file)) {
    return null;
  }

  const buffer = fs.readFileSync(file);
  const floats = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  const width = floats.length / ids.length;

  if (!Number.isInteger(width)) {
    return null;
  }

  return new Map(ids.map((id, index) => [id, floats.subarray(index * width, (index + 1) * width)]));
}

function saveVectors(directory, ids, vectors, key) {
  fs.mkdirSync(directory, { recursive: true });
  const width = vectors[0].length;
  const floats = new Float32Array(ids.length * width);

  vectors.forEach((vector, index) => floats.set(vector, index * width));
  fs.writeFileSync(cacheFile(directory, key), Buffer.from(floats.buffer));
}

module.exports = { embedMany, embedOne, loadVectors, saveVectors, cacheFile };
