import { defineConfig, mergeConfig } from 'vitest/config';

import rootConfig from '../../vitest.config.js';

// Full-document renders embed brand font faces and take several seconds when the repo-wide
// test run saturates the machine; vitest's 5s default flakes there.
export default mergeConfig(
  rootConfig,
  defineConfig({
    test: { testTimeout: 30_000 },
  }),
);
