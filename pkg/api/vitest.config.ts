import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: [
      {
        find: "@",
        replacement: new URL("./src", import.meta.url).pathname,
      },
      {
        find: "@pkg/db/test-utils",
        replacement: new URL("../../pkg/db/src/test-utils.ts", import.meta.url).pathname,
      },
      {
        find: "@pkg/core",
        replacement: new URL("../../pkg/core/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@pkg/db/schema",
        replacement: new URL("../../pkg/db/src/schema/index.ts", import.meta.url).pathname,
      },
      {
        find: "@pkg/db/database-client",
        replacement: new URL("../../pkg/db/src/database-client.ts", import.meta.url).pathname,
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
