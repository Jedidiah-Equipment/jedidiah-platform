import type { ApiConfig } from "./env.js";

export function getLoggerOptions(config: ApiConfig) {
  return {
    level: config.NODE_ENV === "test" ? "silent" : "info",
  };
}
