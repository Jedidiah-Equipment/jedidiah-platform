import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        // Async Storage 3's published ESM entry uses extensionless internal imports that Metro
        // resolves but Node does not. Its official in-memory entry is the test boundary we want.
        find: /^@react-native-async-storage\/async-storage$/,
        replacement: '@react-native-async-storage/async-storage/jest',
      },
    ],
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
