'use strict';

const { createShutdownHandler } = require('../src/shutdown');

function createServerStub({ closeDelayMs = 0 } = {}) {
  const stub = {
    closed: false,
    close(callback) {
      setTimeout(() => {
        stub.closed = true;
        callback();
      }, closeDelayMs);
    },
  };
  return stub;
}

function createDatabaseStub() {
  return {
    closed: false,
    closedAfterServer: null,
    close() {
      this.closed = true;
    },
  };
}

function createSchedulerStub(busyForMs) {
  const startedAt = Date.now();
  return {
    isRunning: () => Date.now() - startedAt < busyForMs,
  };
}

describe('src/shutdown.js', () => {
  test('closes the database only after the HTTP server has stopped', async () => {
    const server = createServerStub({ closeDelayMs: 20 });
    const database = createDatabaseStub();
    const scheduler = { isRunning: () => false };
    const exit = jest.fn();

    const shutdown = createShutdownHandler(server, database, { scheduler, exit });
    await shutdown('SIGTERM');

    expect(server.closed).toBe(true);
    expect(database.closed).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('exits without waiting when nothing is running', async () => {
    const server = createServerStub();
    const database = createDatabaseStub();
    const exit = jest.fn();

    const shutdown = createShutdownHandler(server, database, {
      scheduler: { isRunning: () => false },
      exit,
    });
    const startedAt = Date.now();
    await shutdown('SIGTERM');

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('waits for a running ingest cycle before closing the database', async () => {
    const server = createServerStub();
    const database = createDatabaseStub();
    const scheduler = createSchedulerStub(120);
    const exit = jest.fn();

    const shutdown = createShutdownHandler(server, database, {
      scheduler,
      exit,
      pollIntervalMs: 10,
    });
    await shutdown('SIGTERM');

    expect(scheduler.isRunning()).toBe(false);
    expect(database.closed).toBe(true);
  });

  test('stops waiting for the ingest cycle once the hard deadline passes', async () => {
    const server = createServerStub();
    const database = createDatabaseStub();
    const exit = jest.fn();

    const shutdown = createShutdownHandler(server, database, {
      scheduler: { isRunning: () => true },
      exit,
      pollIntervalMs: 10,
      maxWaitMs: 50,
    });
    const startedAt = Date.now();
    await shutdown('SIGTERM');

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(database.closed).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('ignores a second signal while a shutdown is already in progress', async () => {
    const server = createServerStub();
    const database = createDatabaseStub();
    const exit = jest.fn();

    const shutdown = createShutdownHandler(server, database, {
      scheduler: { isRunning: () => false },
      exit,
    });
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(exit).toHaveBeenCalledTimes(1);
  });
});
