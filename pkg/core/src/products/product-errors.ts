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

export class DuplicateProductOptionCodeError extends Error {
  readonly code = 'product.option_duplicate_code';
  readonly metadata: { code: string };

  constructor(code: string) {
    super(`Product option code already exists: ${code}`);
    this.name = 'DuplicateProductOptionCodeError';
    this.metadata = { code };
  }
}

export class ProductOptionNotFoundError extends Error {
  readonly code = 'product.option_not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Product option not found: ${id}`);
    this.name = 'ProductOptionNotFoundError';
    this.metadata = { id };
  }
}

export class ProductDepartmentStationMismatchError extends Error {
  readonly code = 'product.department_station_mismatch';
  readonly metadata: { expectedDepartment: string; stationId: string };

  constructor(metadata: { expectedDepartment: string; stationId: string }) {
    super(`Station ${metadata.stationId} does not belong to Department ${metadata.expectedDepartment}`);
    this.name = 'ProductDepartmentStationMismatchError';
    this.metadata = metadata;
  }
}

export type ProductCoreError =
  | DuplicateProductModelCodeError
  | DuplicateProductNameError
  | DuplicateProductOptionCodeError
  | ProductDepartmentStationMismatchError
  | ProductNotFoundError
  | ProductOptionNotFoundError;

export function isProductCoreError(error: unknown): error is ProductCoreError {
  return (
    error instanceof DuplicateProductModelCodeError ||
    error instanceof DuplicateProductNameError ||
    error instanceof DuplicateProductOptionCodeError ||
    error instanceof ProductDepartmentStationMismatchError ||
    error instanceof ProductNotFoundError ||
    error instanceof ProductOptionNotFoundError
  );
}
