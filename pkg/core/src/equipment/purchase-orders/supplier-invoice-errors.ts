export type SupplierInvoiceErrorCode =
  | 'invoice.flag_already_resolved'
  | 'invoice.flag_not_found'
  | 'invoice.not_found'
  | 'invoice.price_not_applicable';

export class SupplierInvoiceError extends Error {
  constructor(
    readonly code: SupplierInvoiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SupplierInvoiceError';
  }
}

export const isSupplierInvoiceError = (error: unknown): error is SupplierInvoiceError =>
  error instanceof SupplierInvoiceError;

/** The panel only ever acts on a Supplier invoice filed against the order it was opened from. */
export const supplierInvoiceNotFound = () =>
  new SupplierInvoiceError('invoice.not_found', 'That Supplier invoice is not filed against this Purchase Order.');

/**
 * Flags are recomputed against the order's current lines on every read (spec §5), so a flag someone
 * is acting on may have stopped existing while the page was open — an amendment agreeing the price
 * is exactly the case. Refusing is right: there is nothing left to apply or dismiss.
 */
export const invoiceFlagNotFound = () =>
  new SupplierInvoiceError(
    'invoice.flag_not_found',
    'That flag is no longer on this invoice. Reload the Purchase Order to see the current cross-check.',
  );

/** One flag, one decision. Re-applying would post a second revaluation for the same correction. */
export const invoiceFlagAlreadyResolved = () =>
  new SupplierInvoiceError('invoice.flag_already_resolved', 'That flag has already been applied or dismissed.');

/**
 * The correction has nothing on the shelf to attach to — the stock was drawn at the old price and
 * those Job costs are stamped (spec §5). The panel says so rather than posting a revaluation that
 * would move an average nothing is valued at.
 */
export const invoicePriceNotApplicable = () =>
  new SupplierInvoiceError(
    'invoice.price_not_applicable',
    'This price cannot be applied: the stock it was received at is no longer on hand.',
  );
