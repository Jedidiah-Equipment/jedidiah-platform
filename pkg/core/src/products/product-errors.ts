export class DuplicateProductNameError extends Error {
  readonly code = 'product.duplicate_name';
  readonly metadata: { name: string };

  constructor(name: string) {
    super(`Product name already exists: ${name}`);
    this.name = 'DuplicateProductNameError';
    this.metadata = { name };
  }
}

export class DuplicateProductModelCodeError extends Error {
  readonly code = 'product.duplicate_model_code';
  readonly metadata: { modelCode: string };

  constructor(modelCode: string) {
    super(`Product model code already exists: ${modelCode}`);
    this.name = 'DuplicateProductModelCodeError';
    this.metadata = { modelCode };
  }
}

export class ProductNotFoundError extends Error {
  readonly code = 'product.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product not found: ${id}`);
    this.name = 'ProductNotFoundError';
    this.metadata = { id };
  }
}

export type ProductCoreError = DuplicateProductModelCodeError | DuplicateProductNameError | ProductNotFoundError;

export function isProductCoreError(error: unknown): error is ProductCoreError {
  return (
    error instanceof DuplicateProductModelCodeError ||
    error instanceof DuplicateProductNameError ||
    error instanceof ProductNotFoundError
  );
}
