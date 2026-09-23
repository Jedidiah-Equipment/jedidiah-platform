import type { UUID } from '@pkg/schema';
import type { PurchaseOrderActionBlockedReason, PurchaseOrderActionName } from '@pkg/schema/equipment';

export class PurchaseOrderNotFoundError extends Error {
  readonly code = 'purchase_order.not_found' as const;

  constructor(readonly id: UUID) {
    super('Purchase Order not found.');
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
 * A never-costed line is written unpriced — a zero standing for "not priced yet". Sending is the
 * human assertion that the price was agreed (spec §4), and a receipt against a zero-priced line
 * would stamp that zero onto the ledger as cost, establishing a zero moving average for a Part that
 * should read "no cost yet" (CONTEXT.md). This check keeps the assertion honest; an order that
 * genuinely costs nothing has to say so on the draft rather than by omission.
 */
export class PurchaseOrderLineNotPricedError extends Error {
  readonly code = 'purchase_order.line_not_priced' as const;

  constructor(readonly lineLabel: string) {
    super(`Set a unit price for ${lineLabel} before sending this Purchase Order.`);
  }
}

export class PurchaseOrderLineIdConflictError extends Error {
  readonly code = 'purchase_order.line_id_conflict' as const;

  constructor() {
    super('This Custom Line id belongs to another Purchase Order.');
  }
}

export class PurchaseOrderInvalidQuantityError extends Error {
  readonly code = 'purchase_order.invalid_quantity' as const;

  constructor(readonly partId: UUID) {
    super('Piece and linear Purchase Order quantities must be whole numbers.');
  }
}

export class PurchaseOrderLineNotFoundError extends Error {
  readonly code = 'purchase_order.line_not_found' as const;

  constructor(
    readonly purchaseOrderId: UUID,
    readonly partId: UUID,
  ) {
    super('This line is not on the Purchase Order.');
  }
}

export class PurchaseOrderLineNotCustomError extends Error {
  readonly code = 'purchase_order.line_not_custom' as const;

  constructor(readonly lineId: UUID) {
    super('Receive a Part Line through a Receipt.');
  }
}

export class PurchaseOrderArrivalBelowZeroError extends Error {
  readonly code = 'purchase_order.arrival_below_zero' as const;

  constructor(
    readonly lineDescription: string,
    readonly arrivedQuantity: number,
  ) {
    super(`${lineDescription} has only ${arrivedQuantity} arrived; its arrival cannot be reversed past zero.`);
  }
}

/** An amendment changes an existing line, so the Part has to already be on the order. */
export class PurchaseOrderLineExistsError extends Error {
  readonly code = 'purchase_order.line_exists' as const;

  constructor(readonly partCode: string) {
    super(`${partCode} is already on this Purchase Order.`);
  }
}

/**
 * A quantity may move either way on a sent order, but never below what has already turned up: the
 * receipts are facts, and an order asking for less than it has taken in describes nothing real.
 */
export class PurchaseOrderAmendmentBelowReceivedError extends Error {
  readonly code = 'purchase_order.amendment_below_received' as const;

  constructor(
    readonly lineLabel: string,
    readonly receivedQuantity: number,
  ) {
    super(`${lineLabel} has already taken ${receivedQuantity} in; a Purchase Order cannot ask for less than that.`);
  }
}

export class PurchaseOrderAmendmentLineHasArrivalsError extends Error {
  readonly code = 'purchase_order.amendment_line_has_arrivals' as const;
  constructor(readonly description: string) {
    super(`${description} has Arrival history, so it cannot be removed.`);
  }
}

export class PurchaseOrderAmendmentLastLineError extends Error {
  readonly code = 'purchase_order.amendment_last_line' as const;
  constructor() {
    super('The last line cannot be removed. Cancel the order instead.');
  }
}

/**
 * Receipts attach to their line by `(purchaseOrderId, partId)`, so swapping the Part out from under
 * them would orphan the arrival — the foreign key refuses it, and this says why before it gets
 * there. A line that has taken delivery is amended by quantity or answered by a return, not rewritten.
 */
export class PurchaseOrderSubstitutionHasReceiptsError extends Error {
  readonly code = 'purchase_order.substitution_has_receipts' as const;

  constructor(readonly partCode: string) {
    super(`${partCode} has already been received, so it can no longer be substituted.`);
  }
}

/** Each blocked reason's wire code, unchanged from the classes it replaced, and the state it names. */
const refusals = {
  'already-closed-short': {
    code: 'purchase_order.already_closed_short',
    state: 'This Purchase Order is already closed short',
  },
  cancelled: { code: 'purchase_order.already_cancelled', state: 'This Purchase Order is cancelled' },
  'closed-short': { code: 'purchase_order.closed_short', state: 'This Purchase Order is closed short' },
  empty: { code: 'purchase_order.empty', state: 'This Purchase Order has no lines' },
  'fully-received': { code: 'purchase_order.fully_received', state: 'This Purchase Order is fully received' },
  'has-movements': {
    code: 'purchase_order.has_receipts',
    state: 'Stock has already moved against this Purchase Order',
  },
  'not-approved': { code: 'purchase_order.not_approved', state: 'This Purchase Order is not approved' },
  'not-draft': { code: 'purchase_order.not_draft', state: 'This Purchase Order is no longer a draft' },
  'not-sent': { code: 'purchase_order.not_sent', state: 'This Purchase Order has not been sent' },
  'nothing-received': { code: 'purchase_order.no_receipts', state: 'Nothing has arrived against this Purchase Order' },
  sent: { code: 'purchase_order.already_sent', state: 'This Purchase Order has been sent' },
} as const satisfies Record<PurchaseOrderActionBlockedReason, { code: `purchase_order.${string}`; state: string }>;

const consequences: Record<PurchaseOrderActionName, string> = {
  amend: 'it cannot be amended',
  approve: 'it cannot be approved',
  cancel: 'it cannot be cancelled',
  closeShort: 'it cannot be closed short',
  edit: 'it cannot be edited',
  fileDocuments: 'nothing can be filed against it',
  preview: 'it cannot be previewed',
  receive: 'nothing can be received against it',
  returnToSupplier: 'nothing can be returned against it',
  revertToDraft: 'it cannot be reverted to draft',
  send: 'it cannot be sent',
};

/**
 * A Purchase Order Action the order's own state refuses: the one class every order-level gate throws.
 * The code is the reason's, unchanged on the wire; the message names what was refused.
 */
export class PurchaseOrderActionRefusedError extends Error {
  readonly code: (typeof refusals)[PurchaseOrderActionBlockedReason]['code'];

  constructor(
    readonly action: PurchaseOrderActionName,
    readonly reason: PurchaseOrderActionBlockedReason,
    readonly id: UUID,
  ) {
    super(`${refusals[reason].state}, so ${consequences[action]}.`);
    this.code = refusals[reason].code;
  }
}

export type PurchaseOrderCoreError =
  | PurchaseOrderActionRefusedError
  | PurchaseOrderArrivalBelowZeroError
  | PurchaseOrderAmendmentBelowReceivedError
  | PurchaseOrderAmendmentLineHasArrivalsError
  | PurchaseOrderAmendmentLastLineError
  | PurchaseOrderInvalidQuantityError
  | PurchaseOrderLineExistsError
  | PurchaseOrderLineNotFoundError
  | PurchaseOrderLineNotCustomError
  | PurchaseOrderLineNotPricedError
  | PurchaseOrderLineIdConflictError
  | PurchaseOrderNotFoundError
  | PurchaseOrderPartNotFoundError
  | PurchaseOrderPartNotPurchasableError
  | PurchaseOrderPartSupplierMismatchError
  | PurchaseOrderSubstitutionHasReceiptsError
  | PurchaseOrderSupplierNotFoundError;

export function isPurchaseOrderCoreError(error: unknown): error is PurchaseOrderCoreError {
  return (
    error instanceof PurchaseOrderActionRefusedError ||
    error instanceof PurchaseOrderArrivalBelowZeroError ||
    error instanceof PurchaseOrderAmendmentBelowReceivedError ||
    error instanceof PurchaseOrderAmendmentLineHasArrivalsError ||
    error instanceof PurchaseOrderAmendmentLastLineError ||
    error instanceof PurchaseOrderInvalidQuantityError ||
    error instanceof PurchaseOrderLineExistsError ||
    error instanceof PurchaseOrderLineNotFoundError ||
    error instanceof PurchaseOrderLineNotCustomError ||
    error instanceof PurchaseOrderLineNotPricedError ||
    error instanceof PurchaseOrderLineIdConflictError ||
    error instanceof PurchaseOrderNotFoundError ||
    error instanceof PurchaseOrderPartNotFoundError ||
    error instanceof PurchaseOrderPartNotPurchasableError ||
    error instanceof PurchaseOrderPartSupplierMismatchError ||
    error instanceof PurchaseOrderSubstitutionHasReceiptsError ||
    error instanceof PurchaseOrderSupplierNotFoundError
  );
}
