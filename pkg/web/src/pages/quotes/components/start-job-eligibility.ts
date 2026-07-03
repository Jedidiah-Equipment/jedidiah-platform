import type { QuoteDetail } from '@pkg/schema';

type StartableQuote = Pick<QuoteDetail, 'job' | 'kind' | 'status'>;

export function canStartJobFromQuote(quote: StartableQuote): boolean {
  if (quote.job !== null) {
    return false;
  }

  return quote.kind === 'product'
    ? quote.status === 'accepted'
    : quote.status === 'draft' || quote.status === 'sent' || quote.status === 'accepted';
}

export function getStartJobUnavailableMessage(quote: StartableQuote, canCreateJob: boolean): string {
  if (quote.job !== null) {
    return 'A Job has already been created from this quote.';
  }

  if (!canCreateJob) {
    return 'You do not have permission to create Jobs.';
  }

  if (quote.kind === 'product') {
    return 'Only accepted product quotes can start a Job.';
  }

  return 'Rejected or cancelled custom quotes cannot start a Job.';
}
