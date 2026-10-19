import type { UUID } from '@pkg/schema';
import type { PurchaseOrderActionBlockedReason, PurchaseOrderActionName } from '@pkg/schema/equipment';

export type PurchaseOrderErrorCode =
  | 'purchase_order.already_cancelled'
  | 'purchase_order.already_closed_short'
  | 'purchase_order.already_sent'
  | 'purchase_order.amendment_below_received'
  | 'purchase_order.amendment_last_line'
  | 'purchase_order.amendment_line_has_arrivals'
  | 'purchase_order.arrival_below_zero'
  | 'purchase_order.closed_short'
  | 'purchase_order.empty'
  | 'purchase_order.fully_received'
  | 'purchase_order.has_receipts'
  | 'purchase_order.invalid_quantity'
  | 'purchase_order.line_exists'
  | 'purchase_order.line_id_conflict'
  | 'purchase_order.line_not_custom'
  | 'purchase_order.line_not_found'
  | 'purchase_order.line_not_priced'
  | 'purchase_order.no_receipts'
  | 'purchase_order.not_approved'
  | 'purchase_order.not_draft'
  | 'purchase_order.not_found'
  | 'purchase_order.not_sent'
  | 'purchase_order.part_not_found'
  | 'purchase_order.part_not_purchasable'
  | 'purchase_order.part_supplier_mismatch'
  | 'purchase_order.substitution_has_receipts'
  | 'purchase_order.supplier_not_found';

/** Which Purchase Order Action the order's own state refused, why, and on which order. */
export type RefusedPurchaseOrderAction = {
  action: PurchaseOrderActionName;
  id: UUID;
  reason: PurchaseOrderActionBlockedReason;
};

export class PurchaseOrderError extends Error {
  constructor(
    readonly code: PurchaseOrderErrorCode,
    message: string,
    readonly refused?: RefusedPurchaseOrderAction,
  ) {
    super(message);
    this.name = 'PurchaseOrderError';
  }
}

export const isPurchaseOrderError = (error: unknown): error is PurchaseOrderError =>
  error instanceof PurchaseOrderError;
export const purchaseOrderNotFound = () =>
  new PurchaseOrderError('purchase_order.not_found', 'Purchase Order not found.');
export const purchaseOrderSupplierNotFound = () =>
  new PurchaseOrderError('purchase_order.supplier_not_found', 'Supplier not found.');
export const purchaseOrderPartNotFound = () =>
  new PurchaseOrderError('purchase_order.part_not_found', 'Part not found.');
export const purchaseOrderPartSupplierMismatch = () =>
  new PurchaseOrderError(
    'purchase_order.part_supplier_mismatch',
    'Every Purchase Order line must use a Part from the selected Supplier.',
  );

/**
 * A built Part is made in-house and bought from nobody, so it has no Supplier to match. Without its
 * own code this reads as a generic supplier mismatch, which sends the buyer looking for the wrong
 * Supplier instead of telling them the Part is not purchasable at all.
 */
export const purchaseOrderPartNotPurchasable = () =>
  new PurchaseOrderError(
    'purchase_order.part_not_purchasable',
    'Built Parts are made in-house and cannot be purchased.',
  );

/**
 * A never-costed line is written unpriced — a zero standing for "not priced yet". Sending is the
 * human assertion that the price was agreed (spec §4), and a receipt against a zero-priced line
 * would stamp that zero onto the ledger as cost, establishing a zero moving average for a Part that
 * should read "no cost yet" (GLOSSARY-EQUIPMENT.md). This check keeps the assertion honest; an order that
 * genuinely costs nothing has to say so on the draft rather than by omission.
 */
export const purchaseOrderLineNotPriced = (lineLabel: string) =>
  new PurchaseOrderError(
    'purchase_order.line_not_priced',
    `Set a unit price for ${lineLabel} before sending this Purchase Order.`,
  );
export const purchaseOrderLineIdConflict = () =>
  new PurchaseOrderError('purchase_order.line_id_conflict', 'This Custom Line id belongs to another Purchase Order.');
export const purchaseOrderInvalidQuantity = () =>
  new PurchaseOrderError(
    'purchase_order.invalid_quantity',
    'Piece and linear Purchase Order quantities must be whole numbers.',
  );
export const purchaseOrderLineNotFound = () =>
  new PurchaseOrderError('purchase_order.line_not_found', 'This line is not on the Purchase Order.');
export const purchaseOrderLineNotCustom = () =>
  new PurchaseOrderError('purchase_order.line_not_custom', 'Receive a Part Line through a Receipt.');
export const purchaseOrderArrivalBelowZero = (lineDescription: string, arrivedQuantity: number) =>
  new PurchaseOrderError(
    'purchase_order.arrival_below_zero',
    `${lineDescription} has only ${arrivedQuantity} arrived; its arrival cannot be reversed past zero.`,
  );

/** An amendment changes an existing line, so the Part has to already be on the order. */
export const purchaseOrderLineExists = (partCode: string) =>
  new PurchaseOrderError('purchase_order.line_exists', `${partCode} is already on this Purchase Order.`);

/**
 * A quantity may move either way on a sent order, but never below what has already turned up: the
 * receipts are facts, and an order asking for less than it has taken in describes nothing real.
 */
export const purchaseOrderAmendmentBelowReceived = (lineLabel: string, receivedQuantity: number) =>
  new PurchaseOrderError(
    'purchase_order.amendment_below_received',
    `${lineLabel} has already taken ${receivedQuantity} in; a Purchase Order cannot ask for less than that.`,
  );
export const purchaseOrderAmendmentLineHasArrivals = (description: string) =>
  new PurchaseOrderError(
    'purchase_order.amendment_line_has_arrivals',
    `${description} has Arrival history, so it cannot be removed.`,
  );
export const purchaseOrderAmendmentLastLine = () =>
  new PurchaseOrderError(
    'purchase_order.amendment_last_line',
    'The last line cannot be removed. Cancel the order instead.',
  );

/**
 * Receipts attach to their line by `(purchaseOrderId, partId)`, so swapping the Part out from under
 * them would orphan the arrival — the foreign key refuses it, and this says why before it gets
 * there. A line that has taken delivery is amended by quantity or answered by a return, not rewritten.
 */
export const purchaseOrderSubstitutionHasReceipts = (partCode: string) =>
  new PurchaseOrderError(
    'purchase_order.substitution_has_receipts',
    `${partCode} has already been received, so it can no longer be substituted.`,
  );

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
  'not-approved': {
    code: 'purchase_order.not_approved',
    state: 'This Purchase Order is not approved and waiting to be sent',
  },
  'not-draft': { code: 'purchase_order.not_draft', state: 'This Purchase Order is no longer a draft' },
  'not-sent': { code: 'purchase_order.not_sent', state: 'This Purchase Order has not been sent' },
  'nothing-received': { code: 'purchase_order.no_receipts', state: 'Nothing has arrived against this Purchase Order' },
  sent: { code: 'purchase_order.already_sent', state: 'This Purchase Order has been sent' },
} as const satisfies Record<PurchaseOrderActionBlockedReason, { code: PurchaseOrderErrorCode; state: string }>;

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
 * A Purchase Order Action the order's own state refuses: what every order-level gate throws. The
 * code is the reason's, unchanged on the wire; the message names what was refused.
 */
export function purchaseOrderActionRefused(
  action: PurchaseOrderActionName,
  reason: PurchaseOrderActionBlockedReason,
  id: UUID,
) {
  // A sent order's preview is an explanation rather than a refusal: its Supplier copy already exists.
  const consequence =
    action === 'preview' && reason === 'sent' ? 'it is read from the PDF saved when it was sent' : consequences[action];
  return new PurchaseOrderError(refusals[reason].code, `${refusals[reason].state}, so ${consequence}.`, {
    action,
    id,
    reason,
  });
}
