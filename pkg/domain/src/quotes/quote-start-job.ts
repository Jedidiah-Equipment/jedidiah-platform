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
  hasProductUnit,
  kind,
  status,
}: {
  hasJob: boolean;
  hasProductUnit: boolean;
  kind: QuoteKind;
  status: QuoteStatus;
}): QuoteStartJobEligibility {
  if (hasJob) {
    return { allowed: false, reason: 'Quote already has a Job.' };
  }

  // This is the Build Job path. Allocation Quotes may only source Rework Jobs, whose
  // narrower creation flow owns the comparison against the Unit's As-Built Spec.
  if (hasProductUnit) {
    return { allowed: false, reason: 'Allocation Quotes can only start a Rework Job.' };
  }

  if (startableStatuses[kind].has(status)) {
    return { allowed: true };
  }

  return { allowed: false, reason: statusDenialReasons[kind] };
}
