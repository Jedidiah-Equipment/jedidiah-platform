import { STOCKTAKE_SCOPE_LABELS, type StocktakeScope } from '@pkg/schema/equipment';

export class StocktakeSessionNotFoundError extends Error {
  readonly code = 'inventory.stocktake_session_not_found';
  readonly metadata: { sessionId: string };

  constructor(sessionId: string) {
    super('Stocktake session not found.');
    this.name = 'StocktakeSessionNotFoundError';
    this.metadata = { sessionId };
  }
}

/** Closing is a once-only latch: the counts are the record, and a closed walk is a finished one. */
export class StocktakeSessionClosedError extends Error {
  readonly code = 'inventory.stocktake_session_closed';
  readonly metadata: { sessionId: string };

  constructor(sessionId: string) {
    super('This stocktake session is already closed.');
    this.name = 'StocktakeSessionClosedError';
    this.metadata = { sessionId };
  }
}

/**
 * A scope is a shop-wide walk, so a second open session would split one scope's uncounted list
 * across two to-dos and let two people each believe they had covered the shelf.
 */
export class StocktakeSessionAlreadyOpenError extends Error {
  readonly code = 'inventory.stocktake_session_already_open';
  readonly metadata: { scope: StocktakeScope };

  constructor(scope: StocktakeScope) {
    super(`A ${STOCKTAKE_SCOPE_LABELS[scope]} stocktake session is already open. Resume it instead.`);
    this.name = 'StocktakeSessionAlreadyOpenError';
    this.metadata = { scope };
  }
}

/**
 * Membership is derived from the Part's Stock Tracking Mode at count time, so counting a perpetual
 * Part inside the raw-material walk is not a scope to widen — it is the wrong walk for that shelf.
 */
export class StocktakePartOutOfScopeError extends Error {
  readonly code = 'inventory.stocktake_part_out_of_scope';
  readonly metadata: { partId: string; scope: StocktakeScope };

  constructor(partId: string, scope: StocktakeScope) {
    super(`This Part is not part of the ${STOCKTAKE_SCOPE_LABELS[scope]} count.`);
    this.name = 'StocktakePartOutOfScopeError';
    this.metadata = { partId, scope };
  }
}

/**
 * The count named fewer buckets than the Part is holding stock in. Almost always means something
 * arrived while the screen was open, so the honest answer is "look again" rather than a write-off
 * of a bucket the counter never saw.
 */
export class StocktakeUncountedBucketError extends Error {
  readonly code = 'inventory.stocktake_uncounted_bucket';
  readonly metadata: { lengthsMm: (number | null)[]; partId: string };

  constructor(partId: string, lengthsMm: (number | null)[]) {
    const lengths = lengthsMm.map((lengthMm) => (lengthMm === null ? 'the shelf' : `${lengthMm} mm`)).join(', ');
    super(`This Part is still holding stock you did not count (${lengths}). Count it again.`);
    this.name = 'StocktakeUncountedBucketError';
    this.metadata = { lengthsMm, partId };
  }
}

export type StocktakeError =
  | StocktakePartOutOfScopeError
  | StocktakeSessionAlreadyOpenError
  | StocktakeSessionClosedError
  | StocktakeSessionNotFoundError
  | StocktakeUncountedBucketError;

export function isStocktakeError(error: unknown): error is StocktakeError {
  return (
    error instanceof StocktakePartOutOfScopeError ||
    error instanceof StocktakeSessionAlreadyOpenError ||
    error instanceof StocktakeSessionClosedError ||
    error instanceof StocktakeSessionNotFoundError ||
    error instanceof StocktakeUncountedBucketError
  );
}
