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

export class PurchaseOrderHasReceiptsError extends Error {
  readonly code = 'purchase_order.has_receipts' as const;

  constructor(readonly id: UUID) {
    super('A Purchase Order with receipts cannot be cancelled.');
  }
}

export type PurchaseOrderCoreError =
  | PurchaseOrderAlreadyCancelledError
  | PurchaseOrderEmptyError
  | PurchaseOrderHasReceiptsError
  | PurchaseOrderInvalidQuantityError
  | PurchaseOrderNotDraftError
  | PurchaseOrderNotFoundError
  | PurchaseOrderPartNotFoundError
  | PurchaseOrderPartSupplierMismatchError
  | PurchaseOrderSupplierNotFoundError;

export function isPurchaseOrderCoreError(error: unknown): error is PurchaseOrderCoreError {
  return (
    error instanceof PurchaseOrderAlreadyCancelledError ||
    error instanceof PurchaseOrderEmptyError ||
    error instanceof PurchaseOrderHasReceiptsError ||
    error instanceof PurchaseOrderInvalidQuantityError ||
    error instanceof PurchaseOrderNotDraftError ||
    error instanceof PurchaseOrderNotFoundError ||
    error instanceof PurchaseOrderPartNotFoundError ||
    error instanceof PurchaseOrderPartSupplierMismatchError ||
    error instanceof PurchaseOrderSupplierNotFoundError
  );
}
