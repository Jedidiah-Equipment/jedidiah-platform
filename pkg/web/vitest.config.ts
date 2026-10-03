import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    maxWorkers: 4,
    exclude: [...configDefaults.exclude, 'dist/**', 'dist-server/**'],
  },
});
