import tsconfigPaths from 'vite-tsconfig-paths';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
  test: {
    exclude: [...configDefaults.exclude, 'dist/**', 'dist-server/**'],
  },
});
