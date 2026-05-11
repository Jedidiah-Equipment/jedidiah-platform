import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "dist/**", "dist-server/**"],
  },
  resolve: {
    alias: {
      "@pkg/schema": new URL("../../pkg/schema/src/index.ts", import.meta.url).pathname,
    },
  },
});
