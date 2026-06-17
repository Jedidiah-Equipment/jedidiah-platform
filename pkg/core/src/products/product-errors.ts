import type { BrochureRequiredField } from '@pkg/schema';

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

export class ProductBrochureIncompleteError extends Error {
  readonly code = 'product.brochure_incomplete';
  readonly metadata: { missingFields: BrochureRequiredField[]; productId: string };

  constructor(productId: string, missingFields: BrochureRequiredField[]) {
    super(`Product Brochure is incomplete: ${productId}`);
    this.name = 'ProductBrochureIncompleteError';
    this.metadata = { missingFields, productId };
  }
}

export class DuplicateProductBayError extends Error {
  readonly code = 'product.bay.duplicate';
  readonly metadata: { bayId: string };

  constructor(bayId: string) {
    super(`Bay appears more than once on a product: ${bayId}`);
    this.name = 'DuplicateProductBayError';
    this.metadata = { bayId };
  }
}

export class ProductBayNotFoundError extends Error {
  readonly code = 'product.bay.not_found';
  readonly metadata: { bayId: string };

  constructor(bayId: string) {
    super(`Product Bay not found: ${bayId}`);
    this.name = 'ProductBayNotFoundError';
    this.metadata = { bayId };
  }
}

export class ProductBayDisabledError extends Error {
  readonly code = 'product.bay.disabled';
  readonly metadata: { bayId: string };

  constructor(bayId: string) {
    super(`Product Bay is disabled: ${bayId}`);
    this.name = 'ProductBayDisabledError';
    this.metadata = { bayId };
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
  | DuplicateProductBayError
  | DuplicateProductModelCodeError
  | DuplicateProductNameError
  | ProductBayDisabledError
  | ProductBayNotFoundError
  | ProductBrochureIncompleteError
  | ProductNotFoundError;

export function isProductCoreError(error: unknown): error is ProductCoreError {
  return (
    error instanceof AssemblyOverrideTargetNotFoundError ||
    error instanceof AssemblyOverrideTargetWrongKindError ||
    error instanceof AssemblyOverrideTargetWrongProductError ||
    error instanceof AssemblyWrongProductError ||
    error instanceof DuplicateAssemblyNameError ||
    error instanceof DuplicateAssemblyPartError ||
    error instanceof DuplicateProductBayError ||
    error instanceof DuplicateProductModelCodeError ||
    error instanceof DuplicateProductNameError ||
    error instanceof ProductBayDisabledError ||
    error instanceof ProductBayNotFoundError ||
    error instanceof ProductBrochureIncompleteError ||
    error instanceof ProductNotFoundError
  );
}
