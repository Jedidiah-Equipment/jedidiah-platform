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

/** How a Part with no Supplier reads to a human. A built Part is made in-house and bought from nobody. */
export const NO_SUPPLIER_LABEL = 'no supplier (built in-house)';

export class PartBulkImportConflictError extends Error {
  readonly code = 'part.bulk_import_conflict';
  /** `supplierName` stays null for a built Part rather than carrying display copy as data. */
  readonly metadata: { code: string; supplierCode: string; supplierName: string | null };

  constructor({
    code,
    supplierCode,
    supplierName,
  }: {
    code: string;
    supplierCode: string;
    supplierName: string | null;
  }) {
    super(
      `Part import row conflicts with existing part identity: ${code} ${supplierName ?? NO_SUPPLIER_LABEL} ${supplierCode}`,
    );
    this.name = 'PartBulkImportConflictError';
    this.metadata = { code, supplierCode, supplierName };
  }
}

/**
 * Supplier XOR BOM cuts both ways: turning a built Part back into a bought one while it still has
 * components would leave a Part holding both, which the DB check cannot see across tables.
 */
export class PartBomLockedError extends Error {
  readonly code = 'part.bom_locked';
  readonly metadata: { id: string };

  constructor(id: string) {
    super('Clear the Bill of Materials before making this a bought Part.');
    this.name = 'PartBomLockedError';
    this.metadata = { id };
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

export class PartLabelSelectionEmptyError extends Error {
  readonly code = 'part.label_selection_empty';

  constructor() {
    super('No Parts match the label selection');
    this.name = 'PartLabelSelectionEmptyError';
  }
}

export type PartCoreError =
  | PartBulkImportConflictError
  | DuplicatePartCodeError
  | PartLabelSelectionEmptyError
  | PartNotFoundError
  | PartSupplierLockedByPurchaseOrderError
  | PartSupplierNotFoundError
  | PartBomLockedError
  | PartUnitOfMeasureLockedError;

export function isPartCoreError(error: unknown): error is PartCoreError {
  return (
    error instanceof PartBulkImportConflictError ||
    error instanceof DuplicatePartCodeError ||
    error instanceof PartLabelSelectionEmptyError ||
    error instanceof PartNotFoundError ||
    error instanceof PartBomLockedError ||
    error instanceof PartSupplierLockedByPurchaseOrderError ||
    error instanceof PartSupplierNotFoundError ||
    error instanceof PartUnitOfMeasureLockedError
  );
}
