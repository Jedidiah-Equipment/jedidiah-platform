import type { UUID } from '@pkg/schema';
import type { JobStockMovementType, PartUnitClass, StockAdjustmentReason } from '@pkg/schema/equipment';

export type StockMovementErrorCode =
  | 'inventory.fabricated_part_cost'
  | 'inventory.invalid_delta'
  | 'inventory.invalid_length'
  | 'inventory.part_code_not_found'
  | 'inventory.part_not_found'
  | 'inventory.periodic_movement';

export class StockMovementError extends Error {
  constructor(
    readonly code: StockMovementErrorCode,
    message: string,
    /** The Part a caller can point at when the refusal is about one. */
    readonly partId?: UUID,
  ) {
    super(message);
    this.name = 'StockMovementError';
  }
}

export const isStockMovementError = (error: unknown): error is StockMovementError =>
  error instanceof StockMovementError;
export const stockMovementPartNotFound = (partId: UUID) =>
  new StockMovementError('inventory.part_not_found', `Part not found: ${partId}`, partId);

/**
 * A scanned label that names no Part. Separate from the id-keyed miss because the reader is holding
 * a physical label: the answer is a reprint or a typed search, not "check the link you followed".
 */
export const scannedPartNotFound = (partCode: string) =>
  new StockMovementError('inventory.part_code_not_found', `No Part carries the code: ${partCode}`);
export const stockMovementDelta = (unitClass: PartUnitClass) =>
  new StockMovementError('inventory.invalid_delta', `${unitClass} stock movements require an integer delta`);
export const stockMovementLength = (requiresLength: boolean) =>
  new StockMovementError(
    'inventory.invalid_length',
    requiresLength ? 'Linear stock movements require a length' : 'Length is only valid for linear stock',
  );

/** A periodic Part records only its opening balance, receipts, and stock counts — never consumption. */
export const periodicStockMovement = (movement: JobStockMovementType | StockAdjustmentReason, partId?: UUID) =>
  new StockMovementError('inventory.periodic_movement', `Periodic stock does not record ${movement} movements`, partId);

/**
 * A Built Part's cost is only ever derived from its own ledger — a build divides the value it
 * consumed across the units it produced. Hand-entering one would assert a price for something we
 * never bought, and for sheet metal cut from plate it would pay for the plate twice (spec §5).
 */
export const fabricatedPartCost = () =>
  new StockMovementError('inventory.fabricated_part_cost', 'A built Part is costed by its build, not by hand');
