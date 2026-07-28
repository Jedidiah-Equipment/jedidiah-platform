export class ProductUnitNotFoundError extends Error {
  readonly code = 'product_unit.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product unit not found: ${id}`);
    this.name = 'ProductUnitNotFoundError';
    this.metadata = { id };
  }
}

export type ProductUnitCoreError = ProductUnitNotFoundError;

export function isProductUnitCoreError(error: unknown): error is ProductUnitCoreError {
  return error instanceof ProductUnitNotFoundError;
}
