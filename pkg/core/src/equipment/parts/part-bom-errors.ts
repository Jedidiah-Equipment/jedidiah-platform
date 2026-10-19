export type PartBomErrorCode =
  | 'part.bom_component_not_found'
  | 'part.bom_cycle'
  | 'part.bom_quantity'
  | 'part.not_built';

export class PartBomError extends Error {
  constructor(
    readonly code: PartBomErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PartBomError';
  }
}

export const isPartBomError = (error: unknown): error is PartBomError => error instanceof PartBomError;

/** A Part has either a Supplier or a BOM, so only a built Part can carry components. */
export const partNotBuilt = () =>
  new PartBomError('part.not_built', 'Only a built Part can carry a Bill of Materials.');
export const partBomComponentNotFound = () =>
  new PartBomError('part.bom_component_not_found', 'BOM component Part not found.');

/**
 * BOMs nest but builds never recurse (spec §6): a Part that can reach itself through its components
 * describes a build nobody could ever perform, so the walk refuses it at save time.
 */
export const partBomCycle = () =>
  new PartBomError('part.bom_cycle', 'That component would make the Part a component of itself.');

/** Discrete and linear components are counted in whole units; only measured ones take decimals. */
export const partBomQuantity = () => new PartBomError('part.bom_quantity', 'This component is counted in whole units.');
