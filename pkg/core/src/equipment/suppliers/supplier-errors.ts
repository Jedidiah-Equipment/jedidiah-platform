export type SupplierErrorCode =
  | 'supplier.duplicate_name'
  | 'supplier.has_draft_purchase_orders'
  | 'supplier.merge_self'
  | 'supplier.not_found';

export class SupplierError extends Error {
  constructor(
    readonly code: SupplierErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SupplierError';
  }
}

export const isSupplierError = (error: unknown): error is SupplierError => error instanceof SupplierError;
export const duplicateSupplierName = (companyName: string) =>
  new SupplierError('supplier.duplicate_name', `Supplier name already exists: ${companyName}`);
export const supplierNotFound = (id: string) => new SupplierError('supplier.not_found', `Supplier not found: ${id}`);
export const supplierHasDraftPurchaseOrders = (id: string) =>
  new SupplierError('supplier.has_draft_purchase_orders', `Supplier has unsent Purchase Orders: ${id}`);
export const supplierMergeSelf = (id: string) =>
  new SupplierError('supplier.merge_self', `Supplier cannot be merged into itself: ${id}`);
