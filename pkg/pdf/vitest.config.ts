import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
    // Full-document renders embed brand font faces and take several seconds when the repo-wide
    // test run saturates the machine; vitest's 5s default flakes there.
    testTimeout: 30_000,
  },
});
