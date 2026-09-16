export const APP_CODE_PREFIXES = [
  'auth',
  'changelog',
  'credit_note',
  'contracting_job',
  'customer',
  'document',
  'feedback',
  'file',
  'directory',
  'fleet',
  'reading',
  'job',
  'inventory',
  'invoice',
  'part',
  'product',
  'product_range',
  'product_unit',
  'purchase_order',
  'quote',
  'rate_card',
  'supplier',
  'user',
] as const;

export type AppCodePrefix = (typeof APP_CODE_PREFIXES)[number];

export type AppCode = `${AppCodePrefix}.${string}`;

export type ApiErrorShape = {
  data?: {
    appCode?: unknown;
    code?: unknown;
    metadata?: unknown;
  };
  message?: unknown;
};
