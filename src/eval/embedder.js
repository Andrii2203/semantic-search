'use strict';

const fs = require('fs');
const path = require('path');

const constants = require('../search-constants');

let pipeline = null;

/* istanbul ignore next */
async function getModel() {
  if (!pipeline) {
    const { pipeline: createPipeline } = await import('@huggingface/transformers');
    pipeline = await createPipeline('feature-extraction', constants.embeddingModel);
  }
  return pipeline;
}

/* istanbul ignore next */
async function embedBatch(texts) {
  const model = await getModel();
  const output = await model(texts, { pooling: 'mean', normalize: true });
  const width = output.dims[output.dims.length - 1];

  return texts.map((_, index) =>
    Array.from(output.data.slice(index * width, (index + 1) * width)),
  );
}

/* istanbul ignore next */
async function embedMany(texts, onProgress) {
  const size = constants.embeddingBatchSize;
  const vectors = [];

  for (let start = 0; start < texts.length; start += size) {
    vectors.push(...(await embedBatch(texts.slice(start, start + size))));
    if (onProgress) {
      onProgress(Math.min(start + size, texts.length), texts.length);
    }
  }

  return vectors;
}

/* istanbul ignore next */
function embedOne(text) {
  return embedBatch([text]).then((vectors) => vectors[0]);
}

function cacheFile(directory) {
  return path.join(directory, `vectors-${constants.embeddingModel.replace(/\W/g, '-')}.bin`);
}

function loadVectors(directory, ids) {
  const file = cacheFile(directory);
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

function saveVectors(directory, ids, vectors) {
  fs.mkdirSync(directory, { recursive: true });
  const width = vectors[0].length;
  const floats = new Float32Array(ids.length * width);

  vectors.forEach((vector, index) => floats.set(vector, index * width));
  fs.writeFileSync(cacheFile(directory), Buffer.from(floats.buffer));
}

module.exports = { embedMany, embedOne, loadVectors, saveVectors, cacheFile };
