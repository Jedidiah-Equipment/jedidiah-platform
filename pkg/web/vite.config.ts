import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import "../../scripts/load-dev-env.mjs";
import { getInjectedClientConfig } from "./src/server/env.js";

const clientConfig = getInjectedClientConfig();

export default defineConfig({
  define: {
    __APP_CONFIG__: JSON.stringify(clientConfig),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@pkg/schema": fileURLToPath(new URL("../../pkg/schema/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
