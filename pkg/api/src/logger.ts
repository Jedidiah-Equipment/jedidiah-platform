import pino from 'pino';
import { getApiConfig } from './env.js';

const config = getApiConfig();

const disabledDomains = parseDomains(config.LOG_DOMAINS_DISABLED);
const silentLogger = pino({ level: 'silent' });

function initLogger() {
  const base: pino.LoggerOptions = {
    level: config.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  };

  const root =
    config.APP_ENV === 'development'
      ? pino({
          ...base,
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        })
      : pino(base);

  return {
    root,
    ai: getDomainLogger(root, 'ai'),
    http: getDomainLogger(root, 'http'),
  };
}

function getDomainLogger(root: pino.Logger, domain: string): pino.Logger {
  if (disabledDomains.has(domain)) {
    return silentLogger;
  }

  const logger = root.child({ domain });
  return logger;
}

function parseDomains(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((domain) => domain.trim())
      .filter(Boolean),
  );
}

export const log = initLogger();
