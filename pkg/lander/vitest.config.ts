import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**', '.output/**'],
    globalSetup: ['../db/src/test-global-setup.ts'],
    setupFiles: ['./src/test/setup.ts', '../db/src/test-setup.ts'],
  },
});
