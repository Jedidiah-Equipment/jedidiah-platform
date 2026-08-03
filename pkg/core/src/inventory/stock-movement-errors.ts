import type { JobStockMovementType, PartUnitClass, StockAdjustmentReason, UUID } from '@pkg/schema';

export class StockMovementPartNotFoundError extends Error {
  readonly code = 'inventory.part_not_found';
  readonly metadata: { partId: UUID };

  constructor(partId: UUID) {
    super(`Part not found: ${partId}`);
    this.name = 'StockMovementPartNotFoundError';
    this.metadata = { partId };
  }
}

export class StockMovementDeltaError extends Error {
  readonly code = 'inventory.invalid_delta';
  readonly metadata: { unitClass: PartUnitClass };

  constructor(unitClass: PartUnitClass) {
    super(`${unitClass} stock movements require an integer delta`);
    this.name = 'StockMovementDeltaError';
    this.metadata = { unitClass };
  }
}

export class StockMovementLengthError extends Error {
  readonly code = 'inventory.invalid_length';
  readonly metadata: { requiresLength: boolean };

  constructor(requiresLength: boolean) {
    super(requiresLength ? 'Linear stock movements require a length' : 'Length is only valid for linear stock');
    this.name = 'StockMovementLengthError';
    this.metadata = { requiresLength };
  }
}

/** A periodic Part records only its opening balance, receipts, and stock counts — never consumption. */
export class PeriodicStockMovementError extends Error {
  readonly code = 'inventory.periodic_movement';
  readonly metadata: { movement: JobStockMovementType | StockAdjustmentReason };

  constructor(movement: JobStockMovementType | StockAdjustmentReason) {
    super(`Periodic stock does not record ${movement} movements`);
    this.name = 'PeriodicStockMovementError';
    this.metadata = { movement };
  }
}

/**
 * A Built Part's cost is only ever derived from its own ledger — a build divides the value it
 * consumed across the units it produced. Hand-entering one would assert a price for something we
 * never bought, and for sheet metal cut from plate it would pay for the plate twice (spec §5).
 */
export class FabricatedPartCostError extends Error {
  readonly code = 'inventory.fabricated_part_cost';

  constructor() {
    super('A built Part is costed by its build, not by hand');
    this.name = 'FabricatedPartCostError';
  }
}

export type StockMovementCoreError =
  | FabricatedPartCostError
  | PeriodicStockMovementError
  | StockMovementDeltaError
  | StockMovementLengthError
  | StockMovementPartNotFoundError;

export function isStockMovementCoreError(error: unknown): error is StockMovementCoreError {
  return (
    error instanceof FabricatedPartCostError ||
    error instanceof PeriodicStockMovementError ||
    error instanceof StockMovementDeltaError ||
    error instanceof StockMovementLengthError ||
    error instanceof StockMovementPartNotFoundError
  );
}
