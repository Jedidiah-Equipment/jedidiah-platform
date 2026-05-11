import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: [
      {
        find: "@app/db/test-utils",
        replacement: new URL("../../packages/db/src/test-utils.ts", import.meta.url).pathname,
      },
      {
        find: "@app/db/schema",
        replacement: new URL("../../packages/db/src/schema/index.ts", import.meta.url).pathname,
      },
      {
        find: "@app/core",
        replacement: new URL("../../packages/core/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@app/db",
        replacement: new URL("../../packages/db/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
});
