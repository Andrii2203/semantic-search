'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { loadDataset, describeDataset, DEFAULT_ROOT } = require('../src/eval/beir-loader');

const BASE_URL = 'https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets';
const MANIFEST_DIRECTORY = path.join(__dirname, '..', 'eval', 'beir-manifests');
const WANTED = ['corpus.jsonl', 'queries.jsonl', 'qrels/test.tsv'];

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return { entries: buffer.readUInt16LE(offset + 10), start: buffer.readUInt32LE(offset + 16) };
    }
  }
  throw new Error('the downloaded file is not a zip archive');
}

function readEntry(buffer, offset) {
  if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
    throw new Error(`corrupt central directory at byte ${offset}`);
  }

  const nameLength = buffer.readUInt16LE(offset + 28);
  const entry = {
    method: buffer.readUInt16LE(offset + 10),
    compressedSize: buffer.readUInt32LE(offset + 20),
    localHeader: buffer.readUInt32LE(offset + 42),
    name: buffer.toString('utf-8', offset + 46, offset + 46 + nameLength),
  };

  const extraLength = buffer.readUInt16LE(offset + 30);
  const commentLength = buffer.readUInt16LE(offset + 32);
  entry.next = offset + 46 + nameLength + extraLength + commentLength;

  return entry;
}

function extract(buffer, entry) {
  const nameLength = buffer.readUInt16LE(entry.localHeader + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeader + 28);
  const start = entry.localHeader + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);

  return entry.method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
}

function wantedTail(name) {
  return WANTED.find((tail) => name.endsWith(tail));
}

function unpack(buffer, directory) {
  const { entries, start } = findEndOfCentralDirectory(buffer);
  const written = [];
  let offset = start;

  for (let index = 0; index < entries; index += 1) {
    const entry = readEntry(buffer, offset);
    offset = entry.next;

    const tail = wantedTail(entry.name);
    if (!tail) {
      continue;
    }

    const destination = path.join(directory, tail);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const content = extract(buffer, entry);
    fs.writeFileSync(destination, content);
    written.push({
      path: tail,
      bytes: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    });
  }

  return written;
}

function offsetLabel(date) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const pad = (value) => String(Math.floor(Math.abs(value))).padStart(2, '0');
  return `${sign}${pad(minutes / 60)}${pad(minutes % 60)}`;
}

function stamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${offsetLabel(date)}`
  );
}

async function fetchDataset(name) {
  const url = `${BASE_URL}/${name}.zip`;
  console.log(`fetching ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const directory = path.join(DEFAULT_ROOT, name);
  fs.mkdirSync(directory, { recursive: true });

  const files = unpack(buffer, directory);
  if (files.length !== WANTED.length) {
    throw new Error(`${url} did not contain ${WANTED.join(', ')}`);
  }

  const counts = describeDataset(loadDataset(name));
  const manifest = {
    dataset: name,
    source: url,
    retrievedAt: stamp(new Date()),
    archiveBytes: buffer.length,
    archiveSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    counts,
    files,
  };

  fs.mkdirSync(MANIFEST_DIRECTORY, { recursive: true });
  fs.writeFileSync(
    path.join(MANIFEST_DIRECTORY, `${name}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(`${name}: ${counts.documents} documents, ${counts.queries} queries, ${counts.judgments} judgments`);
  return manifest;
}

async function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error('usage: node scripts/fetch-beir.js <dataset> [dataset...]');
    process.exit(1);
  }

  for (const name of names) {
    await fetchDataset(name);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
