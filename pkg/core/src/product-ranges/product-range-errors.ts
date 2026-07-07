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

export class ProductRangeHasProductsError extends Error {
  readonly code = 'product_range.has_products';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product Range has linked products: ${id}`);
    this.name = 'ProductRangeHasProductsError';
    this.metadata = { id };
  }
}

export class DuplicateProductRangeVariantNameError extends Error {
  readonly code = 'product_range.variant_duplicate_name';
  readonly metadata: { rangeId: string; name: string };

  constructor(rangeId: string, name: string) {
    super(`Product Range Variant name already exists in Range ${rangeId}: ${name}`);
    this.name = 'DuplicateProductRangeVariantNameError';
    this.metadata = { rangeId, name };
  }
}

export class ProductRangeVariantNotFoundError extends Error {
  readonly code = 'product_range.variant_not_found';
  readonly metadata: { id: string; rangeId: string };

  constructor(rangeId: string, id: string) {
    super(`Product Range Variant not found in Range ${rangeId}: ${id}`);
    this.name = 'ProductRangeVariantNotFoundError';
    this.metadata = { rangeId, id };
  }
}

export type ProductRangeCoreError =
  | DuplicateProductRangeNameError
  | DuplicateProductRangeVariantNameError
  | ProductRangeHasProductsError
  | ProductRangeNotFoundError
  | ProductRangeVariantNotFoundError;

export function isProductRangeCoreError(error: unknown): error is ProductRangeCoreError {
  return (
    error instanceof DuplicateProductRangeNameError ||
    error instanceof DuplicateProductRangeVariantNameError ||
    error instanceof ProductRangeHasProductsError ||
    error instanceof ProductRangeNotFoundError ||
    error instanceof ProductRangeVariantNotFoundError
  );
}
