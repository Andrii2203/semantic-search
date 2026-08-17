'use strict';

const globals = require('globals');
const sonarjs = require('eslint-plugin-sonarjs');

const RETRIEVAL_PATH = [
  'src/search-engine.js',
  'src/routes/search.js',
  'src/reranker.js',
  'src/keyword-extractor.js',
  'src/junk-filter.js',
  'src/feedback.js',
  'src/chunker/*.js',
];

const HTTP_STATUS_CODES = [400, 404];

const COMPLEXITY_EXEMPT = [
  'src/db.js',
  'src/search-engine.js',
  'src/chunker/semantic.js',
  'src/chunker/utils.js',
  'src/parsers/experience-parser.js',
  'src/parsers/ir-builder.js',
  'src/parsers/section-detector.js',
  'src/routes/settings.js',
];

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'client/**', 'scratch/**', 'eval/**', 'data/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2022,
      },
    },
    plugins: { sonarjs },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',
      'no-implicit-globals': 'error',
      complexity: ['error', 10],
      'sonarjs/cognitive-complexity': ['error', 15],
      'max-depth': ['error', 3],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'max-nested-callbacks': ['error', 3],
      'max-statements': ['error', 25],
    },
  },
  {
    files: RETRIEVAL_PATH,
    rules: {
      'no-magic-numbers': [
        'error',
        {
          ignore: [0, 1, ...HTTP_STATUS_CODES],
          ignoreArrayIndexes: true,
          detectObjects: true,
          enforceConst: false,
        },
      ],
    },
  },
  {
    files: COMPLEXITY_EXEMPT,
    rules: {
      complexity: 'off',
      'sonarjs/cognitive-complexity': 'off',
      'max-depth': 'off',
      'max-lines-per-function': 'off',
      'max-statements': 'off',
    },
  },
  {
    files: ['__tests__/**/*.js'],
    rules: {
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'max-nested-callbacks': 'off',
      'max-depth': 'off',
    },
  },
  {
    files: ['scripts/**/*.js'],
    rules: {
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'no-console': 'off',
    },
  },
];
