import { configDefaults, defineConfig } from 'vitest/config';

import { databaseTestTimeout } from '../db/src/test-timeout.ts';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
    globalSetup: ['../db/src/test-global-setup.ts'],
    setupFiles: ['./src/test/setup.ts', '../db/src/test-setup.ts'],
    hookTimeout: databaseTestTimeout,
    testTimeout: databaseTestTimeout,
  },
});
