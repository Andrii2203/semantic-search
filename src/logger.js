'use strict';

const pino = require('pino');
const config = require('./config');

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

const logger = pino({
  level: isTest ? 'silent' : config.logLevel,
  ...(config.isProduction || isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
});

module.exports = logger;
