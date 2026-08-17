'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const UNREACHABLE_MODULES = [
  'src/actions/index.js',
  'src/dispatcher.js',
  'src/eval/intent-selection.js',
];

const UNUSED_EXPORTS = [
  'src/anthropic-client.js :: resetClient',
  'src/db.js :: getSources',
  'src/db.js :: getUserMatch',
  'src/db.js :: insertItemsBatch',
  'src/db.js :: updateItemMetadata',
  'src/eval/judge.js :: judgeAll',
  'src/eval/judgments.js :: isAnswerable',
  'src/eval/judgments.js :: isRelevant',
  'src/groq-client.js :: resetGroqClient',
  'src/health-checker.js :: clearCache',
  'src/sources/index.js :: clearSources',
  'src/sources/index.js :: register',
  'src/validation.js :: ChunkingConfigSchema',
  'src/validation.js :: SearchRequestSchema',
  'src/validation.js :: validateItemId',
];

const UNREAD_SETTINGS = [
  'bm25Weight',
  'chunkingStrategy',
  'semanticWeight',
  'topN',
  'useHyde',
];

const sources = new Map();

function readSource(file) {
  if (!sources.has(file)) {
    sources.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }
  return sources.get(file);
}

function filesUnder(directory) {
  const found = [];
  const pending = [directory];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(path.join(ROOT, current), { withFileTypes: true })) {
      const next = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(next);
      } else if (entry.name.endsWith('.js')) {
        found.push(next);
      }
    }
  }

  return found.sort();
}

function resolveSpecifier(fromFile, specifier) {
  const base = path.resolve(path.dirname(path.join(ROOT, fromFile)), specifier);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  const hit = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return hit ? path.relative(ROOT, hit).split(path.sep).join('/') : null;
}

const dependencies = new Map();

function dependenciesOf(file) {
  if (dependencies.has(file)) {
    return dependencies.get(file);
  }

  const pattern = /(?:require|import)\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const found = [];
  let match = pattern.exec(readSource(file));

  while (match !== null) {
    const resolved = resolveSpecifier(file, match[1]);
    if (resolved) {
      found.push(resolved);
    }
    match = pattern.exec(readSource(file));
  }

  dependencies.set(file, found);
  return found;
}

function reachableFrom(entryPoints) {
  const seen = new Set();
  const pending = [...entryPoints];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!seen.has(current)) {
      seen.add(current);
      pending.push(...dependenciesOf(current));
    }
  }

  return seen;
}

function exportedNames(file) {
  const source = readSource(file);
  const names = new Set();
  const block = source.match(/module\.exports\s*=\s*\{([\s\S]*?)\}\s*;/);

  if (block) {
    for (const part of block[1].split(',')) {
      const name = part.trim().split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) {
        names.add(name);
      }
    }
  }

  const pattern = /(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g;
  let match = pattern.exec(source);
  while (match !== null) {
    names.add(match[1]);
    match = pattern.exec(source);
  }

  return [...names].sort();
}

function productionImporters(everyFile) {
  const index = new Map();

  for (const file of everyFile) {
    if (file.startsWith('__tests__/')) {
      continue;
    }
    for (const dependency of dependenciesOf(file)) {
      if (!index.has(dependency)) {
        index.set(dependency, []);
      }
      index.get(dependency).push(file);
    }
  }

  return index;
}

function isUsedOutsideTests(file, name, importers) {
  const everyMention = new RegExp(`\\b${name}\\b`, 'g');
  const anyMention = new RegExp(`\\b${name}\\b`);
  const ownMentions = (readSource(file).match(everyMention) || []).length;

  if (ownMentions > 2) {
    return true;
  }

  return (importers.get(file) || []).some((other) => anyMention.test(readSource(other)));
}

function settingKeys() {
  const schema = readSource('src/routes/settings.js').match(/const SETTINGS_SCHEMA = \{([\s\S]*?)\n\};/);
  return [...schema[1].matchAll(/^ {2}([A-Za-z_$][\w$]*):/gm)].map((match) => match[1]);
}

function isReadThroughConfigLive(key, moduleFiles) {
  const pattern = new RegExp(`live\\(\\s*['"]${key}['"]`);
  return moduleFiles.some((file) => pattern.test(readSource(file)));
}

const moduleFiles = filesUnder('src');
const scriptFiles = filesUnder('scripts');
const everyFile = [...moduleFiles, ...scriptFiles, ...filesUnder('__tests__')];
const reached = reachableFrom(['src/server.js', ...scriptFiles]);
const importers = productionImporters(everyFile);

const deadModules = moduleFiles.filter((file) => !reached.has(file));

const deadExports = moduleFiles
  .filter((file) => reached.has(file))
  .flatMap((file) =>
    exportedNames(file)
      .filter((name) => !isUsedOutsideTests(file, name, importers))
      .map((name) => `${file} :: ${name}`),
  );

const deadSettings = settingKeys().filter((key) => !isReadThroughConfigLive(key, moduleFiles));

describe('src/ reachability', () => {
  test('every module is reached from the server or a script, unless it is on the debt list', () => {
    expect(deadModules.filter((file) => !UNREACHABLE_MODULES.includes(file))).toEqual([]);
  });

  test('every export of a reached module is referenced by code that is not a test, unless it is on the debt list', () => {
    expect(deadExports.filter((entry) => !UNUSED_EXPORTS.includes(entry))).toEqual([]);
  });

  test('every settings key is read through config.live, unless it is on the debt list', () => {
    expect(deadSettings.filter((key) => !UNREAD_SETTINGS.includes(key))).toEqual([]);
  });
});

describe('the debt lists only shrink', () => {
  test('no listed module is reachable again', () => {
    expect(UNREACHABLE_MODULES.filter((file) => !deadModules.includes(file))).toEqual([]);
  });

  test('no listed export is referenced again', () => {
    expect(UNUSED_EXPORTS.filter((entry) => !deadExports.includes(entry))).toEqual([]);
  });

  test('no listed settings key is read again', () => {
    expect(UNREAD_SETTINGS.filter((key) => !deadSettings.includes(key))).toEqual([]);
  });
});
