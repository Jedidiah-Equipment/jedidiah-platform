import { defineConfig } from 'vitest/config';

// Full-document renders embed brand font faces and take several seconds when the repo-wide
// test run saturates the machine; vitest's 5s default flakes there.
export default defineConfig({
  test: { testTimeout: 30_000 },
});
