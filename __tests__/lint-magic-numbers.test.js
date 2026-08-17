'use strict';

const path = require('path');
const { loadESLint } = require('eslint');

const root = path.join(__dirname, '..');
const projectConfig = require('../eslint.config');

async function lint(code, file) {
  const ESLint = await loadESLint({ useFlatConfig: true });
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: projectConfig });
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });

  return result.messages.filter((message) => message.ruleId === 'no-magic-numbers');
}

describe('the retrieval path carries no magic number', () => {
  test('lint fails when a module in the retrieval path contains a numeric literal', async () => {
    const found = await lint('module.exports = (score) => score * 0.42;\n', 'src/search-engine.js');

    expect(found.map((message) => message.severity)).toEqual([2]);
  });

  test('lint fails on a literal written inside an options object', async () => {
    const found = await lint('module.exports = { weight: 0.42 };\n', 'src/reranker.js');

    expect(found).toHaveLength(1);
  });

  test('lint accepts zero, one and an array index', async () => {
    const source = 'module.exports = (list) => (list.length === 0 ? 1 : list[2]);\n';

    expect(await lint(source, 'src/chunker/semantic.js')).toEqual([]);
  });

  test('lint accepts an HTTP status code', async () => {
    const source = 'module.exports = (res) => res.status(404).end();\n';

    expect(await lint(source, 'src/routes/search.js')).toEqual([]);
  });

  test('lint leaves a module outside the retrieval path alone', async () => {
    const found = await lint('module.exports = () => 42;\n', 'src/logger.js');

    expect(found).toEqual([]);
  });
});
