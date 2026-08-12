'use strict';

jest.mock('../../src/retry', () => ({
  retry: jest.fn((fn) => fn()),
}));

const logger = require('../../src/logger');
const djinni = require('../../src/sources/djinni');

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

describe('src/sources/djinni.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns one item per job block found in the markup', async () => {
    const html =
      '<div class="job-item "><a href="/jobs/123/" class="job_item__header-link">Test Job</a><span class="js-original-text">Description</span></div>';
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(html) });

    const items = await djinni.fetch({ limit: 1 });

    expect(items).toHaveLength(1);
    expect(items[0].metadata.title).toBe('Test Job');
  });

  test('returns an empty array when the site answers with an error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    const items = await djinni.fetch();

    expect(items).toEqual([]);
  });

  test('warns about a layout change when a full page yields no jobs', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const html = `<html><body>${'x'.repeat(2000)}</body></html>`;
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(html) });

    const items = await djinni.fetch();

    expect(items).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'djinni', htmlLength: html.length }),
      expect.stringContaining('layout'),
    );
    warn.mockRestore();
  });

  test('stays silent about the layout when the page itself is empty', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') });

    const items = await djinni.fetch();

    expect(items).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
