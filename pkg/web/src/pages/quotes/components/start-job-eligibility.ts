import { canStartJobFromQuote as getStartJobEligibility } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';

/**
 * The facts the start-Job policy reads. Kept per quote kind so a product quote cannot reach the
 * policy without `reworkRequired`, which only the product-kind `QuoteDetail` carries.
 */
export type StartableQuote =
  | Pick<Extract<QuoteDetail, { kind: 'product' }>, 'job' | 'kind' | 'productUnitId' | 'reworkRequired' | 'status'>
  | Pick<Extract<QuoteDetail, { kind: 'custom' }>, 'job' | 'kind' | 'productUnitId' | 'status'>;

export function canStartJobFromQuote(quote: StartableQuote): boolean {
  return resolveStartJobEligibility(quote).allowed;
}

export function getStartJobUnavailableMessage(quote: StartableQuote, canCreateJob: boolean): string {
  if (quote.job !== null) {
    const result = resolveStartJobEligibility(quote);

    return result.allowed ? 'Quote already has a Job.' : result.reason;
  }

  if (!canCreateJob) {
    return 'You do not have permission to create Jobs.';
  }

  const result = resolveStartJobEligibility(quote);

  return result.allowed ? 'Unable to start a Job from this quote.' : result.reason;
}

function resolveStartJobEligibility(quote: StartableQuote) {
  return getStartJobEligibility({
    hasLiveJob: quote.job !== null,
    hasProductUnit: quote.productUnitId !== null,
    kind: quote.kind,
    reworkRequired: quote.kind === 'product' ? quote.reworkRequired : false,
    status: quote.status,
  });
}
