/**
 * Why a Quote cannot receive a reassigned machine. Each reason names a rule the deal itself breaks,
 * before any Unit is considered.
 */
export type ProductUnitReassignQuoteIneligibleReason = 'allocation-quote' | 'invoiced' | 'not-accepted' | 'not-product';

function reassignQuoteIneligibleMessage(reason: ProductUnitReassignQuoteIneligibleReason): string {
  switch (reason) {
    case 'allocation-quote':
      return 'This Quote already sells a specific machine, so a Unit cannot be reassigned onto it.';
    case 'invoiced':
      return 'This Quote has been invoiced, so its machine can no longer change.';
    case 'not-accepted':
      return 'Only an accepted Quote can receive a Unit.';
    case 'not-product':
      return 'Only a Product Quote can receive a Unit.';
  }
}

export class ProductUnitReassignQuoteIneligibleError extends Error {
  readonly code = 'product_unit.reassign_quote_ineligible';
  readonly metadata: { quoteId: string; reason: ProductUnitReassignQuoteIneligibleReason };

  constructor(quoteId: string, reason: ProductUnitReassignQuoteIneligibleReason) {
    super(reassignQuoteIneligibleMessage(reason));
    this.name = 'ProductUnitReassignQuoteIneligibleError';
    this.metadata = { quoteId, reason };
  }
}

/**
 * Why a machine cannot move. Invoicing is the wall on the selling side too, so a Unit whose sale has
 * been billed stays where the paperwork says it is.
 */
export type ProductUnitReassignUnitIneligibleReason =
  | 'already-on-quote'
  | 'live-rework'
  | 'no-live-build-job'
  | 'owned-outside-deal'
  | 'selling-quote-invoiced'
  | 'wrong-product';

function reassignUnitIneligibleMessage(reason: ProductUnitReassignUnitIneligibleReason): string {
  switch (reason) {
    case 'already-on-quote':
      return 'This Unit is already the machine on that Quote.';
    case 'live-rework':
      return 'This Unit has a live Rework Job, so it is undergoing work for its current Owner.';
    case 'no-live-build-job':
      return 'This Unit has no live build Job to attach to the receiving Quote.';
    case 'owned-outside-deal':
      return 'This Unit was transferred by hand, so our records attribute it to a third party rather than to a deal.';
    case 'selling-quote-invoiced':
      return 'The Quote that sold this Unit has been invoiced, so the machine can no longer be moved.';
    case 'wrong-product':
      return 'This Unit was built as a different Product to the one the receiving Quote sells.';
  }
}

export class ProductUnitReassignUnitIneligibleError extends Error {
  readonly code = 'product_unit.reassign_unit_ineligible';
  readonly metadata: { productUnitId: string; reason: ProductUnitReassignUnitIneligibleReason };

  constructor(productUnitId: string, reason: ProductUnitReassignUnitIneligibleReason) {
    super(reassignUnitIneligibleMessage(reason));
    this.name = 'ProductUnitReassignUnitIneligibleError';
    this.metadata = { productUnitId, reason };
  }
}

/**
 * The receiving Quote's live Job has lost its machine — Unit Removal detached it — so displacement has
 * nothing to send back to Stock. Cancelling that dead Job is the only honest way forward.
 */
export class ProductUnitReassignDeadJobError extends Error {
  readonly code = 'product_unit.reassign_dead_job';
  readonly metadata: { jobCode: string; jobId: string };

  constructor(jobId: string, jobCode: string) {
    super(`${jobCode} on this Quote no longer has a machine. Cancel it before reassigning a Unit here.`);
    this.name = 'ProductUnitReassignDeadJobError';
    this.metadata = { jobCode, jobId };
  }
}

/**
 * The machine this Quote is building is no longer owned by its Customer, so returning it to Stock would
 * take it off whoever holds it now. A hand-recorded Transfer got there first, and a person has to say
 * what should happen.
 */
export class ProductUnitReassignDisplacedOwnerError extends Error {
  readonly code = 'product_unit.reassign_displaced_owner';
  readonly metadata: { productUnitId: string };

  constructor(productUnitId: string, productSerialNumber: string) {
    super(
      `Unit ${productSerialNumber} on this Quote is no longer owned by its Customer, so it cannot be returned to Stock.`,
    );
    this.name = 'ProductUnitReassignDisplacedOwnerError';
    this.metadata = { productUnitId };
  }
}

export type ProductUnitReassignError =
  | ProductUnitReassignDeadJobError
  | ProductUnitReassignDisplacedOwnerError
  | ProductUnitReassignQuoteIneligibleError
  | ProductUnitReassignUnitIneligibleError;

export function isProductUnitReassignError(error: unknown): error is ProductUnitReassignError {
  return (
    error instanceof ProductUnitReassignDeadJobError ||
    error instanceof ProductUnitReassignDisplacedOwnerError ||
    error instanceof ProductUnitReassignQuoteIneligibleError ||
    error instanceof ProductUnitReassignUnitIneligibleError
  );
}
