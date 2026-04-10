'use strict';

const { retry, sleep } = require('../src/retry');

describe('retry', () => {
  test('returns result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on failure and succeeds eventually', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const result = await retry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after max retries exceeded', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fail'));

    await expect(
      retry(fn, { maxRetries: 2, baseDelay: 10, label: 'test-op' }),
    ).rejects.toThrow(/test-op failed after 3 attempts/);

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test('thrown error has code RETRY_EXHAUSTED', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    try {
      await retry(fn, { maxRetries: 1, baseDelay: 10 });
    } catch (err) {
      expect(err.code).toBe('RETRY_EXHAUSTED');
      expect(err.cause.message).toBe('fail');
    }
  });

  test('calls onRetry callback with correct arguments', async () => {
    const onRetry = jest.fn();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('ok');

    await retry(fn, { maxRetries: 2, baseDelay: 10, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 10);
  });

  test('uses exponential backoff delays', async () => {
    const onRetry = jest.fn();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    await retry(fn, { maxRetries: 3, baseDelay: 100, onRetry });

    // First retry delay: 100 * 2^0 = 100
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 100);
    // Second retry delay: 100 * 2^1 = 200
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 200);
  });

  test('works with maxRetries = 0 (no retries)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(retry(fn, { maxRetries: 0, baseDelay: 10 })).rejects.toThrow();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('passes attempt number to fn', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockImplementation((attempt) => Promise.resolve(`attempt-${attempt}`));

    const result = await retry(fn, { maxRetries: 1, baseDelay: 10 });
    expect(result).toBe('attempt-1');
  });
});

describe('sleep', () => {
  test('resolves after specified delay', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // some tolerance
  });
});
