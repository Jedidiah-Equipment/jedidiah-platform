import type { QuoteStatus, UUID } from '@pkg/schema';

export function canCreateJobFromQuote(status: QuoteStatus, productId: UUID | null): boolean {
  return (status === 'draft' || status === 'accepted') && productId !== null;
}
