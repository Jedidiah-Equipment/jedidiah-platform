import dotenv from 'dotenv';
import { configDefaults, defineConfig } from 'vitest/config';

dotenv.config({ path: '.env', quiet: true });

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
