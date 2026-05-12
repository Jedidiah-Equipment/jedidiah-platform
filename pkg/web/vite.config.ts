import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { getInjectedClientConfig } from "./src/server/env.js";

const clientConfig = getInjectedClientConfig();

export default defineConfig({
  define: {
    __APP_CONFIG__: JSON.stringify(clientConfig),
  },
  plugins: [
    tanstackRouter({
      generatedRouteTree: "./src/app/route-tree.gen.ts",
      target: "react",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  server: {
    port: 7001,
  },
  preview: {
    port: 4173,
  },
});
