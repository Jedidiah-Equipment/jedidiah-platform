export type BuildErrorCode =
  | 'inventory.build_component_not_found'
  | 'inventory.build_linear_part'
  | 'inventory.build_periodic_part'
  | 'inventory.build_self_component';

export class BuildError extends Error {
  constructor(
    readonly code: BuildErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BuildError';
  }
}

export const isBuildError = (error: unknown): error is BuildError => error instanceof BuildError;
export const buildComponentNotFound = () =>
  new BuildError('inventory.build_component_not_found', 'Build component Part not found.');

/** A periodic Part records receipts and counts only, so nothing can be produced into its ledger. */
export const buildPeriodicPart = () =>
  new BuildError('inventory.build_periodic_part', 'A periodic Part is counted, not built.');

/**
 * Linear stock is counted in pieces bucketed by length, and a build has no length to produce into.
 * Building bar stock is not a v1 concept — it arrives on a Purchase Order and is cut, never made.
 */
export const buildLinearPart = () =>
  new BuildError('inventory.build_linear_part', 'Linear stock is bought and cut, not built.');

/** Builds never recurse, so a Part can never consume itself — one level, from stock (spec §6). */
export const buildSelfComponent = () =>
  new BuildError('inventory.build_self_component', 'A Part cannot be a component of its own build.');
