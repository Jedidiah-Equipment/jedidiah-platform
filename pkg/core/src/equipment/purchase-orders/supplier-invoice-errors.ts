import type { UUID } from '@pkg/schema';

/** The panel only ever acts on a Supplier invoice filed against the order it was opened from. */
export class SupplierInvoiceNotFoundError extends Error {
  readonly code = 'invoice.not_found' as const;

  constructor(readonly documentId: UUID) {
    super('That Supplier invoice is not filed against this Purchase Order.');
  }
}

/**
 * Flags are recomputed against the order's current lines on every read (spec §5), so a flag someone
 * is acting on may have stopped existing while the page was open — an amendment agreeing the price
 * is exactly the case. Refusing is right: there is nothing left to apply or dismiss.
 */
export class InvoiceFlagNotFoundError extends Error {
  readonly code = 'invoice.flag_not_found' as const;

  constructor(readonly flagKey: string) {
    super('That flag is no longer on this invoice. Reload the Purchase Order to see the current cross-check.');
  }
}

/** One flag, one decision. Re-applying would post a second revaluation for the same correction. */
export class InvoiceFlagAlreadyResolvedError extends Error {
  readonly code = 'invoice.flag_already_resolved' as const;

  constructor(readonly flagKey: string) {
    super('That flag has already been applied or dismissed.');
  }
}

/**
 * The correction has nothing on the shelf to attach to — the stock was drawn at the old price and
 * those Job costs are stamped (spec §5). The panel says so rather than posting a revaluation that
 * would move an average nothing is valued at.
 */
export class InvoicePriceNotApplicableError extends Error {
  readonly code = 'invoice.price_not_applicable' as const;

  constructor(readonly partId: UUID) {
    super('This price cannot be applied: the stock it was received at is no longer on hand.');
  }
}

export type SupplierInvoiceCoreError =
  | InvoiceFlagAlreadyResolvedError
  | InvoiceFlagNotFoundError
  | InvoicePriceNotApplicableError
  | SupplierInvoiceNotFoundError;

export function isSupplierInvoiceCoreError(error: unknown): error is SupplierInvoiceCoreError {
  return (
    error instanceof InvoiceFlagAlreadyResolvedError ||
    error instanceof InvoiceFlagNotFoundError ||
    error instanceof InvoicePriceNotApplicableError ||
    error instanceof SupplierInvoiceNotFoundError
  );
}
