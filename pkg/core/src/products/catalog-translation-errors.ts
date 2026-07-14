export class CatalogProductTranslationNotFoundError extends Error {
  readonly code = 'product.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product translation target not found: ${id}`);
    this.name = 'CatalogProductTranslationNotFoundError';
    this.metadata = { id };
  }
}

export class CatalogProductRangeTranslationNotFoundError extends Error {
  readonly code = 'product_range.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product Range translation target not found: ${id}`);
    this.name = 'CatalogProductRangeTranslationNotFoundError';
    this.metadata = { id };
  }
}

export class CatalogProductRangeVariantTranslationNotFoundError extends Error {
  readonly code = 'product_range.variant_not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product Range Variant translation target not found: ${id}`);
    this.name = 'CatalogProductRangeVariantTranslationNotFoundError';
    this.metadata = { id };
  }
}

export type CatalogTranslationCoreError =
  | CatalogProductRangeTranslationNotFoundError
  | CatalogProductRangeVariantTranslationNotFoundError
  | CatalogProductTranslationNotFoundError;

export function isCatalogTranslationCoreError(error: unknown): error is CatalogTranslationCoreError {
  return (
    error instanceof CatalogProductTranslationNotFoundError ||
    error instanceof CatalogProductRangeTranslationNotFoundError ||
    error instanceof CatalogProductRangeVariantTranslationNotFoundError
  );
}
