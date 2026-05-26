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

export class DuplicateAssemblyNameError extends Error {
  readonly code = 'product.assembly.duplicate_name';
  readonly metadata: { name: string };

  constructor(name: string) {
    super(`Assembly name already exists for product: ${name}`);
    this.name = 'DuplicateAssemblyNameError';
    this.metadata = { name };
  }
}

export class DuplicateAssemblyPartError extends Error {
  readonly code = 'product.assembly.duplicate_part';
  readonly metadata: { partId: string };

  constructor(partId: string) {
    super(`Part appears more than once in an assembly: ${partId}`);
    this.name = 'DuplicateAssemblyPartError';
    this.metadata = { partId };
  }
}

export class AssemblyWrongProductError extends Error {
  readonly code = 'product.assembly.wrong_product';
  readonly metadata: { assemblyId: string; productId: string };

  constructor(assemblyId: string, productId: string) {
    super(`Assembly belongs to a different product: ${assemblyId}`);
    this.name = 'AssemblyWrongProductError';
    this.metadata = { assemblyId, productId };
  }
}

export class AssemblyOverrideTargetNotFoundError extends Error {
  readonly code = 'product.assembly.override_target_not_found';
  readonly metadata: { assemblyId: string };

  constructor(assemblyId: string) {
    super(`Assembly override target not found: ${assemblyId}`);
    this.name = 'AssemblyOverrideTargetNotFoundError';
    this.metadata = { assemblyId };
  }
}

export class AssemblyOverrideTargetWrongProductError extends Error {
  readonly code = 'product.assembly.override_target_wrong_product';
  readonly metadata: { assemblyId: string; productId: string };

  constructor(assemblyId: string, productId: string) {
    super(`Assembly override target belongs to a different product: ${assemblyId}`);
    this.name = 'AssemblyOverrideTargetWrongProductError';
    this.metadata = { assemblyId, productId };
  }
}

export class AssemblyOverrideTargetWrongKindError extends Error {
  readonly code = 'product.assembly.override_target_wrong_kind';
  readonly metadata: { assemblyId: string };

  constructor(assemblyId: string) {
    super(`Assembly override target is not a standard assembly: ${assemblyId}`);
    this.name = 'AssemblyOverrideTargetWrongKindError';
    this.metadata = { assemblyId };
  }
}

export type ProductCoreError =
  | AssemblyOverrideTargetNotFoundError
  | AssemblyOverrideTargetWrongKindError
  | AssemblyOverrideTargetWrongProductError
  | AssemblyWrongProductError
  | DuplicateAssemblyNameError
  | DuplicateAssemblyPartError
  | DuplicateProductModelCodeError
  | DuplicateProductNameError
  | ProductNotFoundError;

export function isProductCoreError(error: unknown): error is ProductCoreError {
  return (
    error instanceof AssemblyOverrideTargetNotFoundError ||
    error instanceof AssemblyOverrideTargetWrongKindError ||
    error instanceof AssemblyOverrideTargetWrongProductError ||
    error instanceof AssemblyWrongProductError ||
    error instanceof DuplicateAssemblyNameError ||
    error instanceof DuplicateAssemblyPartError ||
    error instanceof DuplicateProductModelCodeError ||
    error instanceof DuplicateProductNameError ||
    error instanceof ProductNotFoundError
  );
}
