import pino from "pino";

import type { ApiConfig } from "./env.js";

const allowedDomains = process.env.LOG_DOMAINS
  ? new Set(process.env.LOG_DOMAINS.split(",").map((d) => d.trim()))
  : null;

let _rootLogger: pino.Logger | null = null;

export function initLogger(config: ApiConfig): void {
  const base: pino.LoggerOptions = {
    level: config.LOG_LEVEL,
    redact: ["req.headers.authorization", "req.headers.cookie"],
  };

  _rootLogger =
    config.APP_ENV === "development"
      ? pino({
          ...base,
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss" },
          },
        })
      : pino(base);
}

function getRootLogger(): pino.Logger {
  if (!_rootLogger) {
    _rootLogger = pino({ level: process.env.LOG_LEVEL ?? "info" });
  }
  return _rootLogger;
}

export function createLogger(domain: string): pino.Logger {
  if (allowedDomains && !allowedDomains.has(domain)) {
    return pino({ level: "silent" });
  }
  return getRootLogger().child({ domain });
}

export function getLoggerOptions(config: ApiConfig): pino.Logger {
  initLogger(config);
  return getRootLogger();
}
