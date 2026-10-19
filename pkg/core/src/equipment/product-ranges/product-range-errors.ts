export type ProductRangeErrorCode =
  | 'product_range.duplicate_name'
  | 'product_range.has_products'
  | 'product_range.not_found'
  | 'product_range.variant_duplicate_name'
  | 'product_range.variant_has_products'
  | 'product_range.variant_not_found';

export class ProductRangeError extends Error {
  constructor(
    readonly code: ProductRangeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProductRangeError';
  }
}

export const isProductRangeError = (error: unknown): error is ProductRangeError => error instanceof ProductRangeError;
export const duplicateProductRangeName = (name: string) =>
  new ProductRangeError('product_range.duplicate_name', `Product Range name already exists: ${name}`);
export const productRangeNotFound = (id: string) =>
  new ProductRangeError('product_range.not_found', `Product Range not found: ${id}`);
export const productRangeHasProducts = (id: string) =>
  new ProductRangeError('product_range.has_products', `Product Range has linked products: ${id}`);
export const productRangeVariantHasProducts = (id: string) =>
  new ProductRangeError('product_range.variant_has_products', `Product Range Variant has linked products: ${id}`);
export const duplicateProductRangeVariantName = (rangeId: string, name: string) =>
  new ProductRangeError(
    'product_range.variant_duplicate_name',
    `Product Range Variant name already exists in Range ${rangeId}: ${name}`,
  );
export const productRangeVariantNotFound = (rangeId: string, id: string) =>
  new ProductRangeError(
    'product_range.variant_not_found',
    `Product Range Variant not found in Range ${rangeId}: ${id}`,
  );
