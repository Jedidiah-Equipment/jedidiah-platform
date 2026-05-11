import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: [
      {
        find: "@pkg/db/test-utils",
        replacement: new URL("../../pkg/db/src/test-utils.ts", import.meta.url).pathname,
      },
      {
        find: "@pkg/db/schema",
        replacement: new URL("../../pkg/db/src/schema/index.ts", import.meta.url).pathname,
      },
      {
        find: "@pkg/schema",
        replacement: new URL("../../pkg/schema/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@pkg/db",
        replacement: new URL("../../pkg/db/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
});
