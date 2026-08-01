import type { PartUnitClass, UUID } from '@pkg/schema';

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

export class PeriodicStockAdjustmentError extends Error {
  readonly code = 'inventory.periodic_adjustment';
  readonly metadata: { reason: string };

  constructor(reason: string) {
    super(`Periodic stock cannot be adjusted for ${reason}`);
    this.name = 'PeriodicStockAdjustmentError';
    this.metadata = { reason };
  }
}

export class FabricatedPartCostError extends Error {
  readonly code = 'inventory.fabricated_part_cost';

  constructor() {
    super('Internally fabricated Parts must carry zero material cost');
    this.name = 'FabricatedPartCostError';
  }
}

export type StockMovementCoreError =
  | FabricatedPartCostError
  | PeriodicStockAdjustmentError
  | StockMovementDeltaError
  | StockMovementLengthError
  | StockMovementPartNotFoundError;

export function isStockMovementCoreError(error: unknown): error is StockMovementCoreError {
  return (
    error instanceof FabricatedPartCostError ||
    error instanceof PeriodicStockAdjustmentError ||
    error instanceof StockMovementDeltaError ||
    error instanceof StockMovementLengthError ||
    error instanceof StockMovementPartNotFoundError
  );
}
