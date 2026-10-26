import { configDefaults, defineConfig } from 'vitest/config';

import { databaseTestTimeout } from '../db/src/test-timeout.ts';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    maxWorkers: 4,
    exclude: [...configDefaults.exclude, 'dist/**'],
    globalSetup: ['../db/src/test-global-setup.ts'],
    setupFiles: ['../db/src/test-setup.ts'],
    hookTimeout: databaseTestTimeout,
    testTimeout: databaseTestTimeout,
  },
});
