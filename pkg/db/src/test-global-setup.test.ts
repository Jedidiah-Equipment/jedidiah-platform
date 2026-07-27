import { afterEach, expect, it, vi } from 'vitest';

import runTestDatabaseGlobalSetup from './test-global-setup.js';

const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;

afterEach(() => {
  if (originalTestDatabaseUrl === undefined) {
    delete process.env.TEST_DATABASE_URL;
  } else {
    process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
  }

  vi.restoreAllMocks();
});

it('warns and continues when the opportunistic stale-database sweep is unavailable', async () => {
  delete process.env.TEST_DATABASE_URL;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  await expect(runTestDatabaseGlobalSetup()).resolves.toBeUndefined();

  expect(warn).toHaveBeenCalledWith(
    '[test database cleanup] Unable to sweep stale test databases; continuing the test run.',
    expect.any(Error),
  );
});
