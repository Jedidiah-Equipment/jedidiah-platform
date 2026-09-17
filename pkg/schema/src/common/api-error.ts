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

/** Expected operator outcomes stay in product UI; only unclassified API failures are diagnostics. */
export function shouldReportApiMutationError(error: unknown): boolean {
  if (!isApiErrorShape(error)) return true;
  if (typeof error.data?.appCode === 'string' && error.data.appCode.length > 0) return false;
  if (error.data?.code === 'BAD_REQUEST') return false;

  return true;
}

function isApiErrorShape(error: unknown): error is ApiErrorShape {
  return typeof error === 'object' && error !== null;
}
