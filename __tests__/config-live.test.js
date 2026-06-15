'use strict';

const config = require('../src/config');
const db = require('../src/db');

describe('config.live — settings override .env (Phase 3)', () => {
  afterEach(() => {
    try {
      db.close();
    } catch {
      // already closed
    }
  });

  test('returns the .env/default value when the setting is not set', () => {
    db.init(':memory:');
    // searchThreshold default comes from config.similarityThreshold
    expect(config.live('searchThreshold')).toBe(config.similarityThreshold);
    expect(config.live('groqModel')).toBe(config.groq.model);
    expect(config.live('useHyde')).toBe(false);
  });

  test('a value set via settings overrides the default, typed', () => {
    db.init(':memory:');
    db.setSetting('searchThreshold', 0.5, 'number');
    db.setSetting('useHyde', true, 'boolean');
    db.setSetting('groqModel', 'llama-custom', 'string');

    expect(config.live('searchThreshold')).toBe(0.5);
    expect(config.live('useHyde')).toBe(true);
    expect(config.live('groqModel')).toBe('llama-custom');
  });

  test('falls back to the default when the DB is not initialized (no throw)', () => {
    db.close(); // ensure uninitialized
    expect(() => config.live('searchThreshold')).not.toThrow();
    expect(config.live('searchThreshold')).toBe(config.similarityThreshold);
  });

  test('reset restores defaults', () => {
    db.init(':memory:');
    db.setSetting('topN', 50, 'number');
    expect(config.live('topN')).toBe(50);
    db.resetSettings();
    expect(config.live('topN')).toBe(20); // back to default
  });
});
