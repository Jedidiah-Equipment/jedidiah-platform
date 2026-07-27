import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
    globalSetup: ['./src/test-global-setup.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
