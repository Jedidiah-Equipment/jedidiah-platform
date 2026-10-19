export type ProductUnitErrorCode =
  | 'product_unit.in_use'
  | 'product_unit.not_found'
  | 'product_unit.owner_unchanged'
  | 'product_unit.product_not_found'
  | 'product_unit.transfer_backdated'
  | 'product_unit.transfer_in_future';

export class ProductUnitError extends Error {
  constructor(
    readonly code: ProductUnitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProductUnitError';
  }
}

export const isProductUnitError = (error: unknown): error is ProductUnitError => error instanceof ProductUnitError;
export const productUnitNotFound = (id: string) =>
  new ProductUnitError('product_unit.not_found', `Product unit not found: ${id}`);
export const productUnitProductNotFound = () =>
  new ProductUnitError('product_unit.product_not_found', 'Product not found.');

/** A transfer that leaves the machine where it already is asserts no move, and the log records moves. */
export const productUnitOwnerUnchanged = (ownerId: string | null) =>
  new ProductUnitError(
    'product_unit.owner_unchanged',
    ownerId === null ? 'This unit is already in stock.' : 'This unit already belongs to that customer.',
  );
export const productUnitTransferInFuture = () =>
  new ProductUnitError('product_unit.transfer_in_future', 'Transfer date cannot be in the future.');

/**
 * The Owner is the newest Transfer's destination, so a move dated before the last one would enter the
 * history claiming an origin the machine had already left.
 */
export const productUnitTransferBackdated = (latestOccurredOn: string) =>
  new ProductUnitError(
    'product_unit.transfer_backdated',
    `Transfer date cannot be before this unit's most recent transfer (${latestOccurredOn}).`,
  );

/** Why a Unit cannot be removed. Each reason names something that would be wrong afterwards. */
export type ProductUnitInUseReason = 'live-job' | 'built' | 'quoted' | 'referenced';

/**
 * The two Job reasons name the Job, because "which build?" is the first thing anyone reads this and
 * asks, and by then the refusal has already looked it up.
 */
function productUnitInUseMessage(reason: ProductUnitInUseReason, jobCode: string | null): string {
  switch (reason) {
    case 'live-job':
      return jobCode
        ? `${jobCode} is still live, so this unit cannot be removed.`
        : 'This unit has a Job that is still live, so the machine is being built or has been.';
    case 'built':
      return jobCode
        ? `Completed ${jobCode} built this unit, so its record stands.`
        : 'This unit has a Job that was completed, so the machine was built and its record stands.';
    case 'quoted':
      return 'This unit is named on a Quote that still stands, which would be left pointing at nothing.';
    // The reasons above each name a holder; this one is the foreign key catching a holder they do not know.
    case 'referenced':
      return 'Something still references this unit, so it cannot be removed.';
  }
}

/**
 * Removal only ever reaches a machine that never came to exist, so every way a Unit can still be real —
 * a live build, a build that finished, a Quote still selling it — refuses here rather than at a foreign
 * key. An Owner does not: a build-to-order phantom is owned from the moment it is minted.
 */
export const productUnitInUse = (reason: ProductUnitInUseReason, jobCode: string | null = null) =>
  new ProductUnitError('product_unit.in_use', productUnitInUseMessage(reason, jobCode));
