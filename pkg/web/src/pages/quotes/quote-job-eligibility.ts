import type { QuoteStatus } from '@pkg/schema';

export function canCreateJobFromQuote({ jobId, status }: { jobId: string | null; status: QuoteStatus }): boolean {
  return status !== 'rejected' && !jobId;
}
