/** A Part has either a Supplier or a BOM, so only a built Part can carry components. */
export class PartNotBuiltError extends Error {
  readonly code = 'part.not_built';
  readonly metadata: { partId: string };

  constructor(partId: string) {
    super('Only a built Part can carry a Bill of Materials.');
    this.name = 'PartNotBuiltError';
    this.metadata = { partId };
  }
}

export class PartBomComponentNotFoundError extends Error {
  readonly code = 'part.bom_component_not_found';
  readonly metadata: { componentPartId: string };

  constructor(componentPartId: string) {
    super('BOM component Part not found.');
    this.name = 'PartBomComponentNotFoundError';
    this.metadata = { componentPartId };
  }
}

/**
 * BOMs nest but builds never recurse (spec §6): a Part that can reach itself through its components
 * describes a build nobody could ever perform, so the walk refuses it at save time.
 */
export class PartBomCycleError extends Error {
  readonly code = 'part.bom_cycle';
  readonly metadata: { path: string[] };

  constructor(path: string[]) {
    super('That component would make the Part a component of itself.');
    this.name = 'PartBomCycleError';
    this.metadata = { path };
  }
}

/** Discrete and linear components are counted in whole units; only measured ones take decimals. */
export class PartBomQuantityError extends Error {
  readonly code = 'part.bom_quantity';
  readonly metadata: { componentPartId: string };

  constructor(componentPartId: string) {
    super('This component is counted in whole units.');
    this.name = 'PartBomQuantityError';
    this.metadata = { componentPartId };
  }
}

export type PartBomError = PartBomComponentNotFoundError | PartBomCycleError | PartBomQuantityError | PartNotBuiltError;

export function isPartBomError(error: unknown): error is PartBomError {
  return (
    error instanceof PartBomComponentNotFoundError ||
    error instanceof PartBomCycleError ||
    error instanceof PartBomQuantityError ||
    error instanceof PartNotBuiltError
  );
}
