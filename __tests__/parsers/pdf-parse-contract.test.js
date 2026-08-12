'use strict';

const fs = require('fs');
const path = require('path');

const fakePdfParse = require('pdf-parse');

function findInstalledManifest() {
  let dir = __dirname;

  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', 'pdf-parse', 'package.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    dir = path.dirname(dir);
  }

  throw new Error('pdf-parse is not installed, cannot check the boundary contract');
}

function readInstalledApiDeclaration() {
  const manifestPath = findInstalledManifest();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const typesPath = manifest.exports['.'].require.types;

  return fs.readFileSync(path.join(path.dirname(manifestPath), typesPath), 'utf-8');
}

describe('boundary contract: pdf-parse', () => {
  test('the installed library declares PDFParse as a class', () => {
    expect(readInstalledApiDeclaration()).toMatch(/export declare class PDFParse/);
  });

  test('the installed library declares getText and destroy on that class', () => {
    const declaration = readInstalledApiDeclaration();

    expect(declaration).toMatch(/getText\(.*\): Promise</);
    expect(declaration).toMatch(/destroy\(\): Promise</);
  });

  test('the fake exposes the same shape the library declares', () => {
    expect(typeof fakePdfParse.PDFParse).toBe('function');
    expect(typeof fakePdfParse.PDFParse.prototype.getText).toBe('function');
    expect(typeof fakePdfParse.PDFParse.prototype.destroy).toBe('function');
  });

  test('the fake resolves getText to an object carrying text', async () => {
    const parser = new fakePdfParse.PDFParse({ data: Buffer.from('anything') });

    const result = await parser.getText();

    expect(typeof result.text).toBe('string');
  });
});
