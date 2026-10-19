import type { PartMergeBlocker } from '@pkg/schema/equipment';

export type PartErrorCode =
  | 'part.bom_locked'
  | 'part.bulk_import_conflict'
  | 'part.category_merge_self'
  | 'part.category_name_taken'
  | 'part.category_not_found'
  | 'part.duplicate_code'
  | 'part.import_batch_not_found'
  | 'part.label_selection_empty'
  | 'part.merge_blocked'
  | 'part.merge_self'
  | 'part.not_found'
  | 'part.supplier_locked_by_purchase_order'
  | 'part.supplier_not_found'
  | 'part.unit_of_measure_locked';

export class PartError extends Error {
  constructor(
    readonly code: PartErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PartError';
  }
}

/** How a Part with no Supplier reads to a human. A built Part is made in-house and bought from nobody. */
export const NO_SUPPLIER_LABEL = 'no supplier (built in-house)';

export const isPartError = (error: unknown): error is PartError => error instanceof PartError;
export const duplicatePartCode = (code: string) =>
  new PartError('part.duplicate_code', `Part code already exists: ${code}`);
export const partNotFound = (id: string) => new PartError('part.not_found', `Part not found: ${id}`);
export const partSupplierNotFound = (supplierId: string) =>
  new PartError('part.supplier_not_found', `Part supplier not found: ${supplierId}`);
export const partCategoryNotFound = (categoryId: string) =>
  new PartError('part.category_not_found', `Part Category not found: ${categoryId}`);
export const duplicatePartCategoryName = (name: string) =>
  new PartError('part.category_name_taken', `Part Category name already exists: ${name}`);
export const partCategoryMergeSelf = () =>
  new PartError('part.category_merge_self', 'A Part Category cannot be merged into itself.');
export const partBulkImportConflict = (row: { code: string; supplierCode: string; supplierName: string | null }) =>
  new PartError(
    'part.bulk_import_conflict',
    `Part import row conflicts with existing part identity: ${row.code} ${row.supplierName ?? NO_SUPPLIER_LABEL} ${row.supplierCode}`,
  );

/**
 * Supplier XOR BOM cuts both ways: turning a built Part back into a bought one while it still has
 * components would leave a Part holding both, which the DB check cannot see across tables.
 */
export const partBomLocked = () =>
  new PartError('part.bom_locked', 'Clear the Bill of Materials before making this a bought Part.');
export const partUnitOfMeasureLocked = (id: string) =>
  new PartError(
    'part.unit_of_measure_locked',
    `Part Unit of Measure cannot change after its stock ledger starts: ${id}`,
  );
export const partSupplierLockedByPurchaseOrder = (id: string) =>
  new PartError(
    'part.supplier_locked_by_purchase_order',
    `Part supplier cannot change after the Part is used on a Purchase Order: ${id}`,
  );
export const partMergeSelf = () => new PartError('part.merge_self', 'A Part cannot be merged into itself.');

/** Every reason the pair cannot merge yet, so the user sees the whole list rather than the first. */
export const partMergeBlocked = (blockers: PartMergeBlocker[]) =>
  new PartError(
    'part.merge_blocked',
    `These Parts cannot be merged yet: ${blockers.map((blocker) => blocker.kind).join(', ')}`,
  );
export const partLabelSelectionEmpty = () =>
  new PartError('part.label_selection_empty', 'No Parts match the label selection');
export const partImportBatchNotFound = (batchId: string) =>
  new PartError('part.import_batch_not_found', `Part import batch not found: ${batchId}`);
