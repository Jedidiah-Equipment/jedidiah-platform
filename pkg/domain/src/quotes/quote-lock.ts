export const LOCKED_QUOTE_FIELDS = new Set([
  'customerId',
  'deliveryIncluded',
  'deliveryPrice',
  'discount',
  'productId',
  'quotedBasePrice',
  'quotedCurrencyCode',
  'salesPersonId',
  'selectedAssemblies',
  'status',
]);

export type QuoteEditableResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      field: string;
      reason: string;
    };

export function assertQuoteEditable({
  changedFields,
  hasJob,
}: {
  changedFields: Iterable<string>;
  hasJob: boolean;
}): QuoteEditableResult {
  if (!hasJob) {
    return { allowed: true };
  }

  for (const field of changedFields) {
    if (LOCKED_QUOTE_FIELDS.has(field)) {
      return {
        allowed: false,
        field,
        reason: `Quote is locked because it already has a Job; ${field} cannot be changed.`,
      };
    }
  }

  return { allowed: true };
}
