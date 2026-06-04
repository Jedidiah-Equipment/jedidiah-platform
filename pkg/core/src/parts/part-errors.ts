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

export type PartCoreError =
  | PartBulkImportConflictError
  | DuplicatePartCodeError
  | PartNotFoundError
  | PartSupplierNotFoundError;

export function isPartCoreError(error: unknown): error is PartCoreError {
  return (
    error instanceof PartBulkImportConflictError ||
    error instanceof DuplicatePartCodeError ||
    error instanceof PartNotFoundError ||
    error instanceof PartSupplierNotFoundError
  );
}
