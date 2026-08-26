import type { QuoteDetail } from '@pkg/schema';

/** The facts that decide whether a deal can be handed someone else's machine. */
export type ReceivableQuote = Pick<QuoteDetail, 'invoiceNumber' | 'kind' | 'productUnitId' | 'status'>;

/**
 * Whether this Quote may receive a reassigned Unit: an accepted Product Quote, not yet invoiced, that
 * does not already name a machine of its own. An Allocation Quote is excluded because it links to its
 * machine through the Quote rather than through a build Job.
 *
 * The server asserts all of this again under its locks. This copy exists so the action is absent on a
 * deal it could never work on, rather than present and refused.
 */
export function canReceiveReassignedUnit(quote: ReceivableQuote): boolean {
  return (
    quote.kind === 'product' &&
    quote.status === 'accepted' &&
    quote.invoiceNumber === null &&
    quote.productUnitId === null
  );
}
