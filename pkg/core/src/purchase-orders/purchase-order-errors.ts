import type { PurchaseOrderActionVerdict, UUID } from '@pkg/schema';

export class PurchaseOrderNotFoundError extends Error {
  readonly code = 'purchase_order.not_found' as const;

  constructor(readonly id: UUID) {
    super('Purchase Order not found.');
  }
}

export class PurchaseOrderNotDraftError extends Error {
  readonly code = 'purchase_order.not_draft' as const;

  constructor(readonly id: UUID) {
    super('Only a draft Purchase Order can be edited or approved.');
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
 * A never-costed line is written unpriced — a zero standing for "not priced yet". Sending is the
 * human assertion that the price was agreed (spec §4), and a receipt against a zero-priced line
 * would stamp that zero onto the ledger as cost, establishing a zero moving average for a Part that
 * should read "no cost yet" (CONTEXT.md). This check keeps the assertion honest; an order that
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

/**
 * An order goes to the Supplier only once an admin has signed the draft off, and it is reopened for
 * editing only while that sign-off stands — so the one state fact answers both refusals.
 */
export class PurchaseOrderNotApprovedError extends Error {
  readonly code = 'purchase_order.not_approved' as const;

  constructor(readonly id: UUID) {
    super('Only an approved Purchase Order can be sent or reverted to draft.');
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

/** A closed-short order has no open remainder left, so nothing can still arrive or be changed on it. */
export class PurchaseOrderClosedShortError extends Error {
  readonly code = 'purchase_order.closed_short' as const;

  constructor(readonly id: UUID) {
    super('This Purchase Order was closed short and can no longer be amended or received against.');
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
    readonly partCode: string,
    readonly receivedQuantity: number,
  ) {
    super(`${partCode} has already taken ${receivedQuantity} in; a Purchase Order cannot ask for less than that.`);
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

/** Close-short releases an open remainder, so there has to be a delivery behind it to close short of. */
export class PurchaseOrderNoReceiptsError extends Error {
  readonly code = 'purchase_order.no_receipts' as const;

  constructor(readonly id: UUID) {
    super('A Purchase Order can only be closed short once something has arrived against it. Cancel it instead.');
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

/**
 * Refuses a write the order's own state does not allow, in the words that write already used. The
 * verdict is derived once in `@pkg/domain` and read by both sides of the seam — the payload a
 * surface renders its controls from, and this gate — so a control can no longer offer an action the
 * post then refuses. The mapping is a lookup and nothing more: judgement lives in the derivation.
 */
export function assertPurchaseOrderAction(verdict: PurchaseOrderActionVerdict, id: UUID): void {
  if (verdict.allowed) return;

  switch (verdict.reason) {
    case 'already-closed-short':
      throw new PurchaseOrderAlreadyClosedShortError(id);
    case 'cancelled':
      throw new PurchaseOrderAlreadyCancelledError(id);
    case 'closed-short':
      throw new PurchaseOrderClosedShortError(id);
    case 'empty':
      throw new PurchaseOrderEmptyError(id);
    case 'fully-received':
      throw new PurchaseOrderFullyReceivedError(id);
    case 'has-movements':
      throw new PurchaseOrderHasReceiptsError(id);
    case 'not-approved':
      throw new PurchaseOrderNotApprovedError(id);
    case 'not-draft':
      throw new PurchaseOrderNotDraftError(id);
    case 'not-sent':
      throw new PurchaseOrderNotSentError(id);
    case 'nothing-received':
      throw new PurchaseOrderNoReceiptsError(id);
  }
}

export type PurchaseOrderCoreError =
  | PurchaseOrderAlreadyCancelledError
  | PurchaseOrderAlreadyClosedShortError
  | PurchaseOrderAmendmentBelowReceivedError
  | PurchaseOrderClosedShortError
  | PurchaseOrderEmptyError
  | PurchaseOrderFullyReceivedError
  | PurchaseOrderHasReceiptsError
  | PurchaseOrderInvalidQuantityError
  | PurchaseOrderLineExistsError
  | PurchaseOrderLineNotFoundError
  | PurchaseOrderLineNotPricedError
  | PurchaseOrderNoReceiptsError
  | PurchaseOrderNotApprovedError
  | PurchaseOrderNotDraftError
  | PurchaseOrderNotFoundError
  | PurchaseOrderNotSentError
  | PurchaseOrderPartNotFoundError
  | PurchaseOrderPartNotPurchasableError
  | PurchaseOrderPartSupplierMismatchError
  | PurchaseOrderSubstitutionHasReceiptsError
  | PurchaseOrderSupplierNotFoundError;

export function isPurchaseOrderCoreError(error: unknown): error is PurchaseOrderCoreError {
  return (
    error instanceof PurchaseOrderAlreadyCancelledError ||
    error instanceof PurchaseOrderAlreadyClosedShortError ||
    error instanceof PurchaseOrderAmendmentBelowReceivedError ||
    error instanceof PurchaseOrderClosedShortError ||
    error instanceof PurchaseOrderEmptyError ||
    error instanceof PurchaseOrderFullyReceivedError ||
    error instanceof PurchaseOrderHasReceiptsError ||
    error instanceof PurchaseOrderInvalidQuantityError ||
    error instanceof PurchaseOrderLineExistsError ||
    error instanceof PurchaseOrderLineNotFoundError ||
    error instanceof PurchaseOrderLineNotPricedError ||
    error instanceof PurchaseOrderNoReceiptsError ||
    error instanceof PurchaseOrderNotApprovedError ||
    error instanceof PurchaseOrderNotDraftError ||
    error instanceof PurchaseOrderNotFoundError ||
    error instanceof PurchaseOrderNotSentError ||
    error instanceof PurchaseOrderPartNotFoundError ||
    error instanceof PurchaseOrderPartNotPurchasableError ||
    error instanceof PurchaseOrderPartSupplierMismatchError ||
    error instanceof PurchaseOrderSubstitutionHasReceiptsError ||
    error instanceof PurchaseOrderSupplierNotFoundError
  );
}
