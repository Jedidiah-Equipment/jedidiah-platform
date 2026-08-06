export const APP_CODE_PREFIXES = [
  'auth',
  'changelog',
  'credit_note',
  'customer',
  'document',
  'feedback',
  'file',
  'job',
  'inventory',
  'invoice',
  'part',
  'product',
  'product_range',
  'product_unit',
  'purchase_order',
  'quote',
  'supplier',
  'user',
] as const;

export type AppCodePrefix = (typeof APP_CODE_PREFIXES)[number];

export type AppCode = `${AppCodePrefix}.${string}`;

export type ApiErrorShape = {
  data?: {
    appCode?: unknown;
    code?: unknown;
  };
  message?: unknown;
};
