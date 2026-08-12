'use strict';

const { fetchWithTimeout } = require('../src/http');
const { AppError } = require('../src/errors');

describe('src/http.js', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('returns the response when the server answers in time', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const response = await fetchWithTimeout('https://example.test/data', { timeoutMs: 50 });

    expect(response.status).toBe(200);
  });

  test('rejects with AppError when the server does not answer within the timeout', async () => {
    globalThis.fetch = jest.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    await expect(fetchWithTimeout('https://example.test/hang', { timeoutMs: 20 })).rejects.toThrow(
      AppError,
    );
    await expect(fetchWithTimeout('https://example.test/hang', { timeoutMs: 20 })).rejects.toThrow(
      /timed out after 20ms/,
    );
  });

  test('passes an abort signal to fetch so the socket is released', async () => {
    let receivedSignal = null;
    globalThis.fetch = jest.fn((_url, options) => {
      receivedSignal = options.signal;
      return Promise.resolve({ ok: true, status: 200 });
    });

    await fetchWithTimeout('https://example.test/data', { timeoutMs: 50 });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  test('propagates a network error unchanged', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(fetchWithTimeout('https://example.test/data')).rejects.toThrow(
      'getaddrinfo ENOTFOUND',
    );
  });
});
