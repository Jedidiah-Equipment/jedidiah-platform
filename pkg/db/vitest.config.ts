import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pkg/schema": new URL("../schema/src/index.ts", import.meta.url).pathname,
    },
  },
});
