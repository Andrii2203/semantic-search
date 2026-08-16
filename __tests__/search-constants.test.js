'use strict';

const fs = require('fs');
const path = require('path');

const constants = require('../src/search-constants');

const root = path.join(__dirname, '..');
const document = fs.readFileSync(path.join(root, 'docs', 'reference', 'search-constants.md'), 'utf8');

function rowsOfConstantTables() {
  return document
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .map((cells) => ({
      name: cells[1].replace(/`/g, ''),
      origin: cells[cells.length - 3],
      justification: cells[cells.length - 2],
    }))
    .filter((row) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(row.name));
}


function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

describe('src/search-constants.js against docs/reference/search-constants.md', () => {
  test('no file under src contains the literal 0.65', () => {
    const offenders = sourceFiles(path.join(root, 'src'))
      .filter((file) => /(^|[^\d.])0\.65([^\d]|$)/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  test('search-constants exports every name listed in section 5 of the document', () => {
    const missing = rowsOfConstantTables()
      .filter((row) => !/^(absent|removed)/.test(row.origin))
      .filter((row) => !(row.name in constants))
      .map((row) => row.name);

    expect(missing).toEqual([]);
  });

  test('every name exported by search-constants appears as a row in section 5', () => {
    const documented = new Set(rowsOfConstantTables().map((row) => row.name));
    const undocumented = Object.keys(constants)
      .filter((name) => name !== 'retrieval' && name !== 'evaluation')
      .filter((name) => !documented.has(name));

    expect(undocumented).toEqual([]);
  });

  test('every row whose origin is arbitrary carries a non empty trigger', () => {
    const silent = rowsOfConstantTables()
      .filter((row) => row.origin.startsWith('arbitrary'))
      .filter((row) => row.justification.length === 0)
      .map((row) => row.name);

    expect(silent).toEqual([]);
  });

});
