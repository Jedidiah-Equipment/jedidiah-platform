import { configDefaults, defineConfig } from 'vitest/config';

import { databaseTestTimeout } from './src/test-timeout.ts';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
    globalSetup: ['./src/test-global-setup.ts'],
    setupFiles: ['./src/test-setup.ts'],
    hookTimeout: databaseTestTimeout,
    testTimeout: databaseTestTimeout,
  },
});
