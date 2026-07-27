import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
    globalSetup: ['../db/src/test-global-setup.ts'],
    setupFiles: ['../db/src/test-setup.ts'],
  },
});
