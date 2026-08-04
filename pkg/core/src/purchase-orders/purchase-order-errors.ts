import type { UUID } from '@pkg/schema';

export class PurchaseOrderNotFoundError extends Error {
  readonly code = 'purchase_order.not_found' as const;

  constructor(readonly id: UUID) {
    super('Purchase Order not found.');
  }
}

export class PurchaseOrderNotDraftError extends Error {
  readonly code = 'purchase_order.not_draft' as const;

  constructor(readonly id: UUID) {
    super('Only a draft Purchase Order can be edited or sent.');
  }
}

export class PurchaseOrderAlreadyCancelledError extends Error {
  readonly code = 'purchase_order.already_cancelled' as const;

  constructor(readonly id: UUID) {
    super('This Purchase Order is already cancelled.');
  }
}

export class PurchaseOrderSupplierNotFoundError extends Error {
  readonly code = 'purchase_order.supplier_not_found' as const;

  constructor(readonly supplierId: UUID) {
    super('Supplier not found.');
  }
}

export class PurchaseOrderPartNotFoundError extends Error {
  readonly code = 'purchase_order.part_not_found' as const;

  constructor(readonly partId: UUID) {
    super('Part not found.');
  }
}

export class PurchaseOrderPartSupplierMismatchError extends Error {
  readonly code = 'purchase_order.part_supplier_mismatch' as const;

  constructor(readonly partId: UUID) {
    super('Every Purchase Order line must use a Part from the selected Supplier.');
  }
}

/**
 * A built Part is made in-house and bought from nobody, so it has no Supplier to match. Without its
 * own error this reads as a generic supplier mismatch, which sends the buyer looking for the wrong
 * Supplier instead of telling them the Part is not purchasable at all.
 */
export class PurchaseOrderPartNotPurchasableError extends Error {
  readonly code = 'purchase_order.part_not_purchasable';
  readonly metadata: { partId: string };

  constructor(partId: string) {
    super('Built Parts are made in-house and cannot be purchased.');
    this.name = 'PurchaseOrderPartNotPurchasableError';
    this.metadata = { partId };
  }
}

/**
 * A line created from the buy list is written unpriced — a zero standing for "not priced yet", since
 * the buy list is quantity-only under the cost gate. Sending is the human assertion that the price
 * was agreed (spec §4), and a receipt against a zero-priced line would stamp that zero onto the
 * ledger as cost, establishing a zero moving average for a Part that should read "no cost yet"
 * (CONTEXT.md). This is the check that keeps the assertion honest, and it is why an order that
 * genuinely costs nothing has to say so on the draft rather than by omission.
 */
export class PurchaseOrderLineNotPricedError extends Error {
  readonly code = 'purchase_order.line_not_priced' as const;

  constructor(readonly partCode: string) {
    super(`Set a unit price for ${partCode} before sending this Purchase Order.`);
  }
}

export class PurchaseOrderInvalidQuantityError extends Error {
  readonly code = 'purchase_order.invalid_quantity' as const;

  constructor(readonly partId: UUID) {
    super('Piece and linear Purchase Order quantities must be whole numbers.');
  }
}

export class PurchaseOrderEmptyError extends Error {
  readonly code = 'purchase_order.empty' as const;

  constructor(readonly id: UUID) {
    super('Add at least one line before marking this Purchase Order sent.');
  }
}

/** Stock arrives against an order the Supplier has actually been given — never a draft or a dead one. */
export class PurchaseOrderNotSentError extends Error {
  readonly code = 'purchase_order.not_sent' as const;

  constructor(readonly id: UUID) {
    super('Only a sent Purchase Order can be received against.');
  }
}

export class PurchaseOrderLineNotFoundError extends Error {
  readonly code = 'purchase_order.line_not_found' as const;

  constructor(
    readonly purchaseOrderId: UUID,
    readonly partId: UUID,
  ) {
    super('This Part is not on the Purchase Order.');
  }
}

/** A closed-short order has no open remainder left, so nothing can still arrive against it. */
export class PurchaseOrderClosedShortError extends Error {
  readonly code = 'purchase_order.closed_short' as const;

  constructor(readonly id: UUID) {
    super('This Purchase Order was closed short and can no longer be received against.');
  }
}

/** Close-short releases an open remainder, so there has to be a part-delivery to close short of. */
export class PurchaseOrderNoReceiptsError extends Error {
  readonly code = 'purchase_order.no_receipts' as const;

  constructor(readonly id: UUID) {
    super('A Purchase Order can only be closed short once something has been received against it.');
  }
}

export class PurchaseOrderFullyReceivedError extends Error {
  readonly code = 'purchase_order.fully_received' as const;

  constructor(readonly id: UUID) {
    super('A fully received Purchase Order has no outstanding quantity to close short.');
  }
}

export class PurchaseOrderAlreadyClosedShortError extends Error {
  readonly code = 'purchase_order.already_closed_short' as const;

  constructor(readonly id: UUID) {
    super('This Purchase Order is already closed short.');
  }
}

export class PurchaseOrderHasReceiptsError extends Error {
  readonly code = 'purchase_order.has_receipts' as const;

  constructor(readonly id: UUID) {
    super('A Purchase Order with receipts cannot be cancelled.');
  }
}

export type PurchaseOrderCoreError =
  | PurchaseOrderAlreadyCancelledError
  | PurchaseOrderAlreadyClosedShortError
  | PurchaseOrderClosedShortError
  | PurchaseOrderEmptyError
  | PurchaseOrderFullyReceivedError
  | PurchaseOrderHasReceiptsError
  | PurchaseOrderInvalidQuantityError
  | PurchaseOrderLineNotFoundError
  | PurchaseOrderLineNotPricedError
  | PurchaseOrderNoReceiptsError
  | PurchaseOrderNotDraftError
  | PurchaseOrderNotFoundError
  | PurchaseOrderNotSentError
  | PurchaseOrderPartNotFoundError
  | PurchaseOrderPartNotPurchasableError
  | PurchaseOrderPartSupplierMismatchError
  | PurchaseOrderSupplierNotFoundError;

export function isPurchaseOrderCoreError(error: unknown): error is PurchaseOrderCoreError {
  return (
    error instanceof PurchaseOrderAlreadyCancelledError ||
    error instanceof PurchaseOrderAlreadyClosedShortError ||
    error instanceof PurchaseOrderClosedShortError ||
    error instanceof PurchaseOrderEmptyError ||
    error instanceof PurchaseOrderFullyReceivedError ||
    error instanceof PurchaseOrderHasReceiptsError ||
    error instanceof PurchaseOrderInvalidQuantityError ||
    error instanceof PurchaseOrderLineNotFoundError ||
    error instanceof PurchaseOrderLineNotPricedError ||
    error instanceof PurchaseOrderNoReceiptsError ||
    error instanceof PurchaseOrderNotDraftError ||
    error instanceof PurchaseOrderNotFoundError ||
    error instanceof PurchaseOrderNotSentError ||
    error instanceof PurchaseOrderPartNotFoundError ||
    error instanceof PurchaseOrderPartNotPurchasableError ||
    error instanceof PurchaseOrderPartSupplierMismatchError ||
    error instanceof PurchaseOrderSupplierNotFoundError
  );
}
