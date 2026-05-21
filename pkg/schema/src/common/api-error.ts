export const APP_CODE_PREFIXES = ['auth', 'customer', 'job', 'product', 'quote', 'station', 'user'] as const;

export type AppCodePrefix = (typeof APP_CODE_PREFIXES)[number];

export type AppCode = `${AppCodePrefix}.${string}`;

export type ApiErrorShape = {
  data?: {
    appCode?: unknown;
    code?: unknown;
  };
  message?: unknown;
};
