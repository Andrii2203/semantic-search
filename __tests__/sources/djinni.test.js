'use strict';

// 1. Мокаємо retry, щоб він не чекав секундами під час тестів
jest.mock('../../src/retry', () => ({
  retry: jest.fn((fn) => fn()) // Виконує функцію одразу без пауз
}));

const djinni = require('../../src/sources/djinni');

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

describe('Djinni Source (Phase 8)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('parseJobs: extracts jobs from HTML correctly', async () => {
    const mockHtml = `<div class="job-item "><a href="/jobs/123/" class="job_item__header-link">Test Job</a><span class="js-original-text">Description</span></div>`;
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(mockHtml) });

    const items = await djinni.fetch({ limit: 1 });
    expect(items).toHaveLength(1);
    expect(items[0].metadata.title).toBe('Test Job');
  });

  test('fetch: returns empty array on failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const items = await djinni.fetch();
    expect(items).toEqual([]); // Тест пройде миттєво, бо retry тепер не чекає
  });
});
