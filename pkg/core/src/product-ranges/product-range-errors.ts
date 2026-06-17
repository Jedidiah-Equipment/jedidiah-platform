export class DuplicateProductRangeNameError extends Error {
  readonly code = 'product_range.duplicate_name';
  readonly metadata: { name: string };

  constructor(name: string) {
    super(`Product Range name already exists: ${name}`);
    this.name = 'DuplicateProductRangeNameError';
    this.metadata = { name };
  }
}

export class ProductRangeNotFoundError extends Error {
  readonly code = 'product_range.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product Range not found: ${id}`);
    this.name = 'ProductRangeNotFoundError';
    this.metadata = { id };
  }
}

export type ProductRangeCoreError = DuplicateProductRangeNameError | ProductRangeNotFoundError;

export function isProductRangeCoreError(error: unknown): error is ProductRangeCoreError {
  return error instanceof DuplicateProductRangeNameError || error instanceof ProductRangeNotFoundError;
}
