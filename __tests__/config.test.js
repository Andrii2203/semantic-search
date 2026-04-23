'use strict';

const config = require('../src/config');

describe('Config System pedantic check', () => {
  test('should have all properties loaded', () => {
    expect(config.port).toBeDefined();
    expect(config.similarityThreshold).toBeDefined();
    expect(config.dbPath).toBeDefined();
  });

  test('numeric values are correctly parsed', () => {
    expect(typeof config.port).toBe('number');
    expect(typeof config.similarityThreshold).toBe('number');
  });
});
