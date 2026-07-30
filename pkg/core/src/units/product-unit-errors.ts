export class ProductUnitNotFoundError extends Error {
  readonly code = 'product_unit.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product unit not found: ${id}`);
    this.name = 'ProductUnitNotFoundError';
    this.metadata = { id };
  }
}

export class ProductUnitProductNotFoundError extends Error {
  readonly code = 'product_unit.product_not_found';
  readonly metadata: { productId: string };

  constructor(productId: string) {
    super('Product not found.');
    this.name = 'ProductUnitProductNotFoundError';
    this.metadata = { productId };
  }
}

/** A transfer that leaves the machine where it already is asserts no move, and the log records moves. */
export class ProductUnitOwnerUnchangedError extends Error {
  readonly code = 'product_unit.owner_unchanged';
  readonly metadata: { id: string; ownerId: string | null };

  constructor(id: string, ownerId: string | null) {
    super(ownerId === null ? 'This unit is already in stock.' : 'This unit already belongs to that customer.');
    this.name = 'ProductUnitOwnerUnchangedError';
    this.metadata = { id, ownerId };
  }
}

export class ProductUnitTransferInFutureError extends Error {
  readonly code = 'product_unit.transfer_in_future';
  readonly metadata: { occurredOn: string; plantToday: string };

  constructor(occurredOn: string, plantToday: string) {
    super('Transfer date cannot be in the future.');
    this.name = 'ProductUnitTransferInFutureError';
    this.metadata = { occurredOn, plantToday };
  }
}

/**
 * The Owner is the newest Transfer's destination, so a move dated before the last one would enter the
 * history claiming an origin the machine had already left.
 */
export class ProductUnitTransferBackdatedError extends Error {
  readonly code = 'product_unit.transfer_backdated';
  readonly metadata: { latestOccurredOn: string; occurredOn: string };

  constructor(occurredOn: string, latestOccurredOn: string) {
    super(`Transfer date cannot be before this unit's most recent transfer (${latestOccurredOn}).`);
    this.name = 'ProductUnitTransferBackdatedError';
    this.metadata = { latestOccurredOn, occurredOn };
  }
}

export type ProductUnitCoreError =
  | ProductUnitNotFoundError
  | ProductUnitOwnerUnchangedError
  | ProductUnitProductNotFoundError
  | ProductUnitTransferBackdatedError
  | ProductUnitTransferInFutureError;

export function isProductUnitCoreError(error: unknown): error is ProductUnitCoreError {
  return (
    error instanceof ProductUnitNotFoundError ||
    error instanceof ProductUnitOwnerUnchangedError ||
    error instanceof ProductUnitProductNotFoundError ||
    error instanceof ProductUnitTransferBackdatedError ||
    error instanceof ProductUnitTransferInFutureError
  );
}
