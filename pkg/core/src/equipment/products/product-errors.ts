export type ProductErrorCode =
  | 'product.assembly.duplicate_name'
  | 'product.assembly.duplicate_part'
  | 'product.assembly.kind_changed'
  | 'product.assembly.override_target_not_found'
  | 'product.assembly.override_target_wrong_kind'
  | 'product.assembly.override_target_wrong_product'
  | 'product.assembly.wrong_product'
  | 'product.bay.disabled'
  | 'product.bay.duplicate'
  | 'product.bay.not_found'
  | 'product.brochure_incomplete'
  | 'product.duplicate_model_code'
  | 'product.duplicate_name'
  | 'product.material_part.invalid'
  | 'product.not_found'
  | 'product.range.not_found'
  | 'product.variant.not_found';

export class ProductError extends Error {
  constructor(
    readonly code: ProductErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProductError';
  }
}

export const isProductError = (error: unknown): error is ProductError => error instanceof ProductError;
export const productNotFound = (id: string) => new ProductError('product.not_found', `Product not found: ${id}`);
export const duplicateProductName = (name: string) =>
  new ProductError('product.duplicate_name', `Product name already exists: ${name}`);
export const duplicateProductModelCode = (modelCode: string) =>
  new ProductError('product.duplicate_model_code', `Product model code already exists: ${modelCode}`);
export const productBrochureIncomplete = (productId: string) =>
  new ProductError('product.brochure_incomplete', `Product Brochure is incomplete: ${productId}`);
export const productRangeReferenceNotFound = (rangeId: string) =>
  new ProductError('product.range.not_found', `Product Range not found: ${rangeId}`);
export const productRangeVariantReferenceNotFound = (rangeId: string, variantId: string) =>
  new ProductError('product.variant.not_found', `Product Range Variant not found in Range ${rangeId}: ${variantId}`);
export const duplicateProductBay = (bayId: string) =>
  new ProductError('product.bay.duplicate', `Bay appears more than once on a product: ${bayId}`);
export const productBayNotFound = (bayId: string) =>
  new ProductError('product.bay.not_found', `Product Bay not found: ${bayId}`);
export const productBayDisabled = (bayId: string) =>
  new ProductError('product.bay.disabled', `Product Bay is disabled: ${bayId}`);
export const productMaterialPartInvalid = (partId: string) =>
  new ProductError(
    'product.material_part.invalid',
    `Product Material List Part must use periodic stock tracking: ${partId}`,
  );
export const duplicateAssemblyName = (name: string) =>
  new ProductError('product.assembly.duplicate_name', `Assembly name already exists for product: ${name}`);
export const duplicateAssemblyPart = (partId: string) =>
  new ProductError('product.assembly.duplicate_part', `Part appears more than once in an assembly: ${partId}`);
export const assemblyWrongProduct = (assemblyId: string) =>
  new ProductError('product.assembly.wrong_product', `Assembly belongs to a different product: ${assemblyId}`);
export const assemblyKindChanged = (assemblyId: string) =>
  new ProductError('product.assembly.kind_changed', `Assembly kind is immutable: ${assemblyId}`);
export const assemblyOverrideTargetNotFound = (assemblyId: string) =>
  new ProductError('product.assembly.override_target_not_found', `Assembly override target not found: ${assemblyId}`);
export const assemblyOverrideTargetWrongProduct = (assemblyId: string) =>
  new ProductError(
    'product.assembly.override_target_wrong_product',
    `Assembly override target belongs to a different product: ${assemblyId}`,
  );
export const assemblyOverrideTargetWrongKind = (assemblyId: string) =>
  new ProductError(
    'product.assembly.override_target_wrong_kind',
    `Assembly override target is not a standard assembly: ${assemblyId}`,
  );
