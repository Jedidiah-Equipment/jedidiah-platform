export type LogBindings = Record<string, unknown>;

export type LogMethod = (bindings: LogBindings, message?: string) => void;

export type DomainLogger = {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
};

export type Logger = {
  root: DomainLogger;
  ai: DomainLogger;
  http: DomainLogger;
  service: DomainLogger;
};
