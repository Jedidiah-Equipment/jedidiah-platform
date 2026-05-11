import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@app/schema": new URL("../schema/src/index.ts", import.meta.url).pathname,
    },
  },
});
