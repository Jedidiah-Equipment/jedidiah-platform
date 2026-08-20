export class DuplicateSupplierNameError extends Error {
  readonly code = 'supplier.duplicate_name';
  readonly metadata: { companyName: string };

  constructor(companyName: string) {
    super(`Supplier name already exists: ${companyName}`);
    this.name = 'DuplicateSupplierNameError';
    this.metadata = { companyName };
  }
}

export class SupplierNotFoundError extends Error {
  readonly code = 'supplier.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Supplier not found: ${id}`);
    this.name = 'SupplierNotFoundError';
    this.metadata = { id };
  }
}

export class SupplierHasDraftPurchaseOrdersError extends Error {
  readonly code = 'supplier.has_draft_purchase_orders';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Supplier has unsent Purchase Orders: ${id}`);
    this.name = 'SupplierHasDraftPurchaseOrdersError';
    this.metadata = { id };
  }
}

export type SupplierCoreError =
  | DuplicateSupplierNameError
  | SupplierHasDraftPurchaseOrdersError
  | SupplierNotFoundError;

export function isSupplierCoreError(error: unknown): error is SupplierCoreError {
  return (
    error instanceof DuplicateSupplierNameError ||
    error instanceof SupplierHasDraftPurchaseOrdersError ||
    error instanceof SupplierNotFoundError
  );
}
