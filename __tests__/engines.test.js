'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function majorFromRange(range) {
  const match = range.match(/(\d+)/);
  return match ? match[1] : null;
}

describe('the Node version is pinned in one place and read everywhere', () => {
  test('the major version of Node in engines matches the one in every Dockerfile stage', () => {
    const engines = majorFromRange(JSON.parse(read('package.json')).engines.node);
    const stages = [...read('Dockerfile').matchAll(/^FROM node:(\d+)/gm)].map((m) => m[1]);

    expect(stages.length).toBeGreaterThan(0);
    for (const stage of stages) {
      expect(stage).toBe(engines);
    }
  });

  test('the major version of Node in .nvmrc matches the one in engines', () => {
    const engines = majorFromRange(JSON.parse(read('package.json')).engines.node);

    expect(majorFromRange(read('.nvmrc'))).toBe(engines);
  });

  test('the major version of Node in CI matches the one in engines', () => {
    const engines = majorFromRange(JSON.parse(read('package.json')).engines.node);
    const ci = read(path.join('.github', 'workflows', 'ci.yml'));
    const declared = ci.match(/node-version:\s*'?(\d+)'?/);

    expect(declared).not.toBeNull();
    expect(declared[1]).toBe(engines);
  });

  test('installing on a Node version below the pin is refused rather than attempted', () => {
    expect(read('.npmrc')).toMatch(/^engine-strict\s*=\s*true$/m);
  });
});
