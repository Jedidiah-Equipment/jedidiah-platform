import { canStartJobFromQuote as getStartJobEligibility } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';

type StartableQuote = Pick<QuoteDetail, 'job' | 'kind' | 'status'>;

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
    hasJob: quote.job !== null,
    kind: quote.kind,
    status: quote.status,
  });
}
