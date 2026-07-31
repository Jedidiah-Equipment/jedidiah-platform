import type { ProductUnitBuildState, ProductUnitDisplayBuildState } from '@pkg/schema';

/**
 * How a Unit's build reads to a person: Complete is On Hand plus an Owner. The machine has no third
 * build state — its build either finished or it did not — so this folds in the Owner at the surface
 * rather than asking the server to invent one, and the Units list filter offers the same three.
 */
export function toDisplayBuildState(
  buildState: ProductUnitBuildState,
  owner: { id: string } | null,
): ProductUnitDisplayBuildState {
  return buildState === 'on-hand' && owner ? 'complete' : buildState;
}
