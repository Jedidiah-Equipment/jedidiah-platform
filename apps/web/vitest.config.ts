import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "dist/**", "dist-server/**"],
  },
  resolve: {
    alias: {
      "@app/schema": new URL("../../packages/schema/src/index.ts", import.meta.url).pathname,
    },
  },
});
