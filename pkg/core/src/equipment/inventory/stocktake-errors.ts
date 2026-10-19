import { STOCKTAKE_SCOPE_LABELS, type StocktakeScope } from '@pkg/schema/equipment';

export type StocktakeErrorCode =
  | 'inventory.stocktake_part_out_of_scope'
  | 'inventory.stocktake_session_already_open'
  | 'inventory.stocktake_session_closed'
  | 'inventory.stocktake_session_not_found'
  | 'inventory.stocktake_uncounted_bucket';

export class StocktakeError extends Error {
  constructor(
    readonly code: StocktakeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StocktakeError';
  }
}

export const isStocktakeError = (error: unknown): error is StocktakeError => error instanceof StocktakeError;
export const stocktakeSessionNotFound = () =>
  new StocktakeError('inventory.stocktake_session_not_found', 'Stocktake session not found.');

/** Closing is a once-only latch: the counts are the record, and a closed walk is a finished one. */
export const stocktakeSessionClosed = () =>
  new StocktakeError('inventory.stocktake_session_closed', 'This stocktake session is already closed.');

/**
 * A scope is a shop-wide walk, so a second open session would split one scope's uncounted list
 * across two to-dos and let two people each believe they had covered the shelf.
 */
export const stocktakeSessionAlreadyOpen = (scope: StocktakeScope) =>
  new StocktakeError(
    'inventory.stocktake_session_already_open',
    `A ${STOCKTAKE_SCOPE_LABELS[scope]} stocktake session is already open. Resume it instead.`,
  );

/**
 * Membership is derived from the Part's Stock Tracking Mode at count time, so counting a perpetual
 * Part inside the raw-material walk is not a scope to widen — it is the wrong walk for that shelf.
 */
export const stocktakePartOutOfScope = (scope: StocktakeScope) =>
  new StocktakeError(
    'inventory.stocktake_part_out_of_scope',
    `This Part is not part of the ${STOCKTAKE_SCOPE_LABELS[scope]} count.`,
  );

/**
 * The count named fewer buckets than the Part is holding stock in. Almost always means something
 * arrived while the screen was open, so the honest answer is "look again" rather than a write-off
 * of a bucket the counter never saw.
 */
export function stocktakeUncountedBucket(lengthsMm: (number | null)[]) {
  const lengths = lengthsMm.map((lengthMm) => (lengthMm === null ? 'the shelf' : `${lengthMm} mm`)).join(', ');
  return new StocktakeError(
    'inventory.stocktake_uncounted_bucket',
    `This Part is still holding stock you did not count (${lengths}). Count it again.`,
  );
}
