import type { QuoteKind, QuoteStatus } from '@pkg/schema';

/** Server-enforced status gate for Quote Document generation; UI mirrors it for gating only. */
export function isQuoteDocumentGenerationAllowed(status: QuoteStatus): boolean {
  return status !== 'rejected' && status !== 'cancelled';
}

/** A product quote whose product was deleted has no facts to render a document from. */
export function canGenerateQuoteDocument({
  kind,
  product,
  status,
}: {
  kind: QuoteKind;
  product: object | null;
  status: QuoteStatus;
}): boolean {
  return isQuoteDocumentGenerationAllowed(status) && (kind === 'custom' || product !== null);
}

export function formatQuoteDocumentLeadTime(days: number): string {
  return `${days} working days`;
}

export function getDefaultQuoteDocumentLeadTime(quote: { product: { buildTimeDays: number } | null }): string {
  return quote.product === null ? '' : formatQuoteDocumentLeadTime(quote.product.buildTimeDays);
}

/** Availability may resolve after typing starts; only replace an untouched default. */
export function resolveQuoteDocumentLeadTime({
  availability,
  fallbackLeadTime,
  hasUserEditedLeadTime,
  leadTime,
}: {
  availability: { defaultLeadTimeWorkingDays: number } | null | undefined;
  fallbackLeadTime: string;
  hasUserEditedLeadTime: boolean;
  leadTime: string;
}): string {
  if (hasUserEditedLeadTime) return leadTime;
  return availability ? formatQuoteDocumentLeadTime(availability.defaultLeadTimeWorkingDays) : fallbackLeadTime;
}
