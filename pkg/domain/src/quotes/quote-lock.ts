export const EDITABLE_LOCKED_QUOTE_FIELDS = new Set([
  'notes',
  'paymentTerms',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'validUntil',
]);

export type QuoteEditableResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
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
    if (!EDITABLE_LOCKED_QUOTE_FIELDS.has(field)) {
      return {
        allowed: false,
        reason: `Quote is locked because it already has a Job; ${field} cannot be changed.`,
      };
    }
  }

  return { allowed: true };
}
