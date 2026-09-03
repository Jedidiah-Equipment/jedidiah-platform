export class BuildComponentNotFoundError extends Error {
  readonly code = 'inventory.build_component_not_found';
  readonly metadata: { componentPartId: string };

  constructor(componentPartId: string) {
    super('Build component Part not found.');
    this.name = 'BuildComponentNotFoundError';
    this.metadata = { componentPartId };
  }
}

/** A periodic Part records receipts and counts only, so nothing can be produced into its ledger. */
export class BuildPeriodicPartError extends Error {
  readonly code = 'inventory.build_periodic_part';
  readonly metadata: { partId: string };

  constructor(partId: string) {
    super('A periodic Part is counted, not built.');
    this.name = 'BuildPeriodicPartError';
    this.metadata = { partId };
  }
}

/**
 * Linear stock is counted in pieces bucketed by length, and a build has no length to produce into.
 * Building bar stock is not a v1 concept — it arrives on a Purchase Order and is cut, never made.
 */
export class BuildLinearPartError extends Error {
  readonly code = 'inventory.build_linear_part';
  readonly metadata: { partId: string };

  constructor(partId: string) {
    super('Linear stock is bought and cut, not built.');
    this.name = 'BuildLinearPartError';
    this.metadata = { partId };
  }
}

/** Builds never recurse, so a Part can never consume itself — one level, from stock (spec §6). */
export class BuildSelfComponentError extends Error {
  readonly code = 'inventory.build_self_component';
  readonly metadata: { partId: string };

  constructor(partId: string) {
    super('A Part cannot be a component of its own build.');
    this.name = 'BuildSelfComponentError';
    this.metadata = { partId };
  }
}

export type BuildError =
  | BuildComponentNotFoundError
  | BuildLinearPartError
  | BuildPeriodicPartError
  | BuildSelfComponentError;

export function isBuildError(error: unknown): error is BuildError {
  return (
    error instanceof BuildComponentNotFoundError ||
    error instanceof BuildLinearPartError ||
    error instanceof BuildPeriodicPartError ||
    error instanceof BuildSelfComponentError
  );
}
