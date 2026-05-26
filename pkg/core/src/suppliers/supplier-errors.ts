export class DuplicateSupplierNameError extends Error {
  readonly code = 'supplier.duplicate_name';
  readonly metadata: { name: string };

  constructor(name: string) {
    super(`Supplier name already exists: ${name}`);
    this.name = 'DuplicateSupplierNameError';
    this.metadata = { name };
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

export type SupplierCoreError = DuplicateSupplierNameError | SupplierNotFoundError;

export function isSupplierCoreError(error: unknown): error is SupplierCoreError {
  return error instanceof DuplicateSupplierNameError || error instanceof SupplierNotFoundError;
}
