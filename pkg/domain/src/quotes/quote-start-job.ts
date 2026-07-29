import type { QuoteKind, QuoteStatus, UUID } from '@pkg/schema';

export type QuoteStartJobEligibility =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
    };

/** Shared with the server so the Rework refusal reads the same wherever it is raised. */
export const ALLOCATION_QUOTE_NO_REWORK_REASON = 'Allocation Quote has no new Assemblies to fit.';

const startableStatuses = {
  custom: new Set<QuoteStatus>(['accepted', 'draft', 'sent']),
  product: new Set<QuoteStatus>(['accepted']),
} satisfies Record<QuoteKind, ReadonlySet<QuoteStatus>>;

const statusDenialReasons = {
  custom: 'Rejected or cancelled quotes cannot start a Job.',
  product: 'Only accepted quotes can start a Job.',
} satisfies Record<QuoteKind, string>;

/** An Allocation Quote sells a Product Unit we already hold, so the only Job it sources is a Rework Job. */
export function isReworkQuote(quote: { productUnitId: UUID | null }): boolean {
  return quote.productUnitId !== null;
}

export function canStartJobFromQuote({
  hasJob,
  hasProductUnit,
  kind,
  reworkRequired,
  status,
}: {
  hasJob: boolean;
  hasProductUnit: boolean;
  kind: QuoteKind;
  reworkRequired: boolean;
  status: QuoteStatus;
}): QuoteStartJobEligibility {
  if (hasJob) {
    return { allowed: false, reason: 'Quote already has a Job.' };
  }

  if (!startableStatuses[kind].has(status)) {
    return { allowed: false, reason: statusDenialReasons[kind] };
  }

  // A Rework Job's Build Spec is only the Assemblies being added, so an Allocation Quote that adds
  // none has no work to schedule.
  if (hasProductUnit && !reworkRequired) {
    return { allowed: false, reason: ALLOCATION_QUOTE_NO_REWORK_REASON };
  }

  return { allowed: true };
}
