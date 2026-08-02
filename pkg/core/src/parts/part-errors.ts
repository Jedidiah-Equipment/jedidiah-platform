export class DuplicatePartCodeError extends Error {
  readonly code = 'part.duplicate_code';
  readonly metadata: { code: string };

  constructor(code: string) {
    super(`Part code already exists: ${code}`);
    this.name = 'DuplicatePartCodeError';
    this.metadata = { code };
  }
}

export class PartNotFoundError extends Error {
  readonly code = 'part.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Part not found: ${id}`);
    this.name = 'PartNotFoundError';
    this.metadata = { id };
  }
}

export class PartSupplierNotFoundError extends Error {
  readonly code = 'part.supplier_not_found';
  readonly metadata: { supplierId: string };

  constructor(supplierId: string) {
    super(`Part supplier not found: ${supplierId}`);
    this.name = 'PartSupplierNotFoundError';
    this.metadata = { supplierId };
  }
}

export class PartBulkImportConflictError extends Error {
  readonly code = 'part.bulk_import_conflict';
  readonly metadata: { code: string; supplierCode: string; supplierName: string };

  constructor({
    code,
    supplierCode,
    supplierName,
  }: {
    code: string;
    supplierCode: string;
    supplierName: string;
  }) {
    super(`Part import row conflicts with existing part identity: ${code} ${supplierName} ${supplierCode}`);
    this.name = 'PartBulkImportConflictError';
    this.metadata = { code, supplierCode, supplierName };
  }
}

export class PartUnitOfMeasureLockedError extends Error {
  readonly code = 'part.unit_of_measure_locked';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Part Unit of Measure cannot change after its stock ledger starts: ${id}`);
    this.name = 'PartUnitOfMeasureLockedError';
    this.metadata = { id };
  }
}

export class PartSupplierLockedByPurchaseOrderError extends Error {
  readonly code = 'part.supplier_locked_by_purchase_order';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Part supplier cannot change after the Part is used on a Purchase Order: ${id}`);
    this.name = 'PartSupplierLockedByPurchaseOrderError';
    this.metadata = { id };
  }
}

export type PartCoreError =
  | PartBulkImportConflictError
  | DuplicatePartCodeError
  | PartNotFoundError
  | PartSupplierLockedByPurchaseOrderError
  | PartSupplierNotFoundError
  | PartUnitOfMeasureLockedError;

export function isPartCoreError(error: unknown): error is PartCoreError {
  return (
    error instanceof PartBulkImportConflictError ||
    error instanceof DuplicatePartCodeError ||
    error instanceof PartNotFoundError ||
    error instanceof PartSupplierLockedByPurchaseOrderError ||
    error instanceof PartSupplierNotFoundError ||
    error instanceof PartUnitOfMeasureLockedError
  );
}
