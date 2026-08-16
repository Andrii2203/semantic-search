'use strict';

const sources = require('../../src/sources/index');

describe('src/sources/index.js', () => {
  test('no built in source is registered, so a cycle with no enabled user source fetches nothing', async () => {
    const items = await sources.fetchAll();

    expect(items).toEqual([]);
  });

  test('an unknown source name returns nothing rather than throwing', async () => {
    const items = await sources.fetchOne('hn');

    expect(items).toEqual([]);
  });

  test('the registry still accepts a source, so the extension point survives the removal', async () => {
    const item = { id: 'x1', content: 'text', type: 'post', source: 'later', metadata: {} };
    sources.register({ name: 'later', fetch: async () => [item] });

    await expect(sources.fetchAll()).resolves.toEqual([item]);

    sources.clearSources();
  });
});
