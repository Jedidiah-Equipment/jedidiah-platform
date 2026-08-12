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

/** Why a Unit cannot be removed. Each reason names something that would be wrong afterwards. */
export type ProductUnitInUseReason = 'live-job' | 'built' | 'owned' | 'quoted' | 'job-without-quote' | 'referenced';

const productUnitInUseMessages = {
  'live-job': 'This unit has a Job that is still live, so the machine is being built or has been.',
  built: 'This unit has a Job that was completed, so the machine was built and its record stands.',
  owned: 'This unit belongs to a customer, so the machine exists and cannot be removed.',
  quoted: 'This unit is named on a Quote, which would be left pointing at nothing.',
  'job-without-quote':
    'This unit carries a cancelled Job with no Quote behind it, which would be left describing no work at all.',
  // The reasons above each name a holder; this one is the foreign key catching a holder they do not know.
  referenced: 'Something still references this unit, so it cannot be removed.',
} as const satisfies Record<ProductUnitInUseReason, string>;

/**
 * Removal only ever reaches a machine that never came to exist, so every way a Unit can still be real —
 * a live build, an Owner, a Quote naming it — refuses here rather than at a foreign key.
 */
export class ProductUnitInUseError extends Error {
  readonly code = 'product_unit.in_use';
  readonly metadata: { id: string; reason: ProductUnitInUseReason };

  constructor(id: string, reason: ProductUnitInUseReason) {
    super(productUnitInUseMessages[reason]);
    this.name = 'ProductUnitInUseError';
    this.metadata = { id, reason };
  }
}

export type ProductUnitCoreError =
  | ProductUnitInUseError
  | ProductUnitNotFoundError
  | ProductUnitOwnerUnchangedError
  | ProductUnitProductNotFoundError
  | ProductUnitTransferBackdatedError
  | ProductUnitTransferInFutureError;

export function isProductUnitCoreError(error: unknown): error is ProductUnitCoreError {
  return (
    error instanceof ProductUnitInUseError ||
    error instanceof ProductUnitNotFoundError ||
    error instanceof ProductUnitOwnerUnchangedError ||
    error instanceof ProductUnitProductNotFoundError ||
    error instanceof ProductUnitTransferBackdatedError ||
    error instanceof ProductUnitTransferInFutureError
  );
}
