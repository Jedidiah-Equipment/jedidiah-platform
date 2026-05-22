import type { QuoteStatus } from '@pkg/schema';

export function canCreateJobFromQuote(status: QuoteStatus): boolean {
  return status === 'draft' || status === 'sent' || status === 'accepted';
}
