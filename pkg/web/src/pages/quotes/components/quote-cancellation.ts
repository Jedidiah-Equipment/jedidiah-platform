import { isQuoteLocked } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';

/**
 * The header action is for a Locked Quote and an administrator. An unlocked Quote is cancelled from
 * its status field, which is the salesperson's path and needs no destructive header button.
 */
export function shouldOfferQuoteCancellation({
  canCancel,
  quote,
}: {
  canCancel: boolean;
  quote: Pick<QuoteDetail, 'hasEverSourcedJob' | 'kind' | 'productUnitId' | 'status'>;
}): boolean {
  return (
    canCancel &&
    quote.status !== 'cancelled' &&
    isQuoteLocked({
      hasEverSourcedJob: quote.hasEverSourcedJob,
      hasProductUnit: quote.productUnitId !== null,
      kind: quote.kind,
      status: quote.status,
    })
  );
}
