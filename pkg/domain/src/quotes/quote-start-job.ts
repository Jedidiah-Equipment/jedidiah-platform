import type { QuoteKind, QuoteStatus } from '@pkg/schema';

export type QuoteStartJobEligibility =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
    };

const startableStatuses = {
  custom: new Set<QuoteStatus>(['accepted', 'draft', 'sent']),
  product: new Set<QuoteStatus>(['accepted']),
} satisfies Record<QuoteKind, ReadonlySet<QuoteStatus>>;

const statusDenialReasons = {
  custom: 'Rejected or cancelled quotes cannot start a Job.',
  product: 'Only accepted quotes can start a Job.',
} satisfies Record<QuoteKind, string>;

export function canStartJobFromQuote({
  hasJob,
  kind,
  status,
}: {
  hasJob: boolean;
  kind: QuoteKind;
  status: QuoteStatus;
}): QuoteStartJobEligibility {
  if (hasJob) {
    return { allowed: false, reason: 'Quote already has a Job.' };
  }

  if (startableStatuses[kind].has(status)) {
    return { allowed: true };
  }

  return { allowed: false, reason: statusDenialReasons[kind] };
}
