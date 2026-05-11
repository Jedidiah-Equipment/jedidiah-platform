import { defineConfig } from "drizzle-kit";

import "../../scripts/load-dev-env.mjs";
import { getDatabaseUrl } from "./src/env.js";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  strict: true,
  verbose: true,
});
