import {
  AssemblyName,
  AssemblyPart,
  NullableThumbnailDataUrl,
  Price,
  type Product,
  ProductBayDefaultWorkingDays,
  ProductBayInput,
  ProductBrochureEnabled,
  ProductBuildTimeDays,
  ProductCategory,
  ProductCreateInput,
  ProductDescription,
  ProductKeyFeatures,
  ProductLanderEnabled,
  ProductModelCode,
  ProductName,
  ProductNameHighlight,
  ProductRequiresVinNumber,
  ProductTechnicalDetails,
  ProductUpdateInput,
  refineProductAssemblies,
  refineProductBays,
  UUID,
  type UUID as UUIDType,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';

// Form representation of an assembly: like the API `AssemblyInput` but without its coercion
// and defaults, so the controlled value shape matches what the editor holds. Field rules still
// come from the schema scalars (`AssemblyName`, `AssemblyPart`, `Price`, `UUID`).
const StandardAssemblyFormInput = z.object({
  id: UUID.optional(),
  kind: z.literal('standard'),
  name: AssemblyName,
  parts: z.array(AssemblyPart),
});

const OptionalAssemblyFormInput = z.object({
  id: UUID.optional(),
  kind: z.literal('optional'),
  name: AssemblyName,
  overrideStandardAssemblyIds: z.array(UUID),
  parts: z.array(AssemblyPart),
  price: Price,
});

export type ProductAssemblyFormInput = z.infer<typeof ProductAssemblyFormInput>;
export const ProductAssemblyFormInput = z.discriminatedUnion('kind', [
  StandardAssemblyFormInput,
  OptionalAssemblyFormInput,
]);

export type ProductBayFormInput = z.infer<typeof ProductBayFormInput>;
export const ProductBayFormInput = ProductBayInput.extend({
  defaultWorkingDays: ProductBayDefaultWorkingDays,
});

const ProductFormFields = z.object({
  basePrice: Price,
  // `category` holds `''` for "no value" like other nullable text inputs.
  category: emptyStringOr(ProductCategory),
  currencyCode: z.literal('ZAR'),
  description: emptyStringOr(ProductDescription),
  buildTimeDays: ProductBuildTimeDays,
  modelCode: ProductModelCode,
  name: ProductName,
  // `nameHighlight` holds `''` for "no value" like other nullable text inputs.
  nameHighlight: emptyStringOr(ProductNameHighlight),
  rangeId: requiredSelection(UUID, 'Select a range'),
  variantId: emptyStringOr(UUID),
  requiresVinNumber: ProductRequiresVinNumber,
  brochureEnabled: ProductBrochureEnabled,
  landerEnabled: ProductLanderEnabled,
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

export type ProductFormValues = z.infer<typeof ProductFormValues>;
export const ProductFormValues = ProductFormFields.extend({
  assemblies: z.array(ProductAssemblyFormInput).superRefine(refineProductAssemblies),
  // Key-feature lines reuse the schema-owned content + cap rules.
  keyFeatures: ProductKeyFeatures,
  // Technical-detail rows reuse the schema-owned label/value + cap rules.
  technicalDetails: ProductTechnicalDetails,
  productBays: z.array(ProductBayFormInput).superRefine(refineProductBays),
});

export type ProductCreateFormValues = z.infer<typeof ProductCreateFormValues>;
export const ProductCreateFormValues = ProductFormFields.pick({
  basePrice: true,
  buildTimeDays: true,
  modelCode: true,
  name: true,
  rangeId: true,
});

export const emptyProductFormValues: ProductFormValues = {
  assemblies: [],
  basePrice: NaN,
  category: '',
  currencyCode: 'ZAR',
  description: '',
  buildTimeDays: NaN,
  keyFeatures: [],
  technicalDetails: [],
  modelCode: '',
  name: '',
  nameHighlight: '',
  productBays: [],
  rangeId: '',
  variantId: '',
  requiresVinNumber: false,
  brochureEnabled: false,
  landerEnabled: false,
  thumbnailDataUrl: null,
};

/** Schema → form. `basePrice`/`buildTimeDays` use `NaN` so a missing number reads as empty. */
export function toProductFormValues(initialProduct?: Product): ProductFormValues {
  return {
    assemblies: toProductAssemblyInputs(initialProduct),
    basePrice: initialProduct?.basePrice ?? NaN,
    category: initialProduct?.category ?? '',
    currencyCode: initialProduct?.currencyCode ?? 'ZAR',
    description: initialProduct?.description ?? '',
    buildTimeDays: initialProduct?.buildTimeDays ?? NaN,
    keyFeatures: initialProduct?.keyFeatures ?? [],
    technicalDetails: initialProduct?.technicalDetails ?? [],
    modelCode: initialProduct?.modelCode ?? '',
    name: initialProduct?.name ?? '',
    nameHighlight: initialProduct?.nameHighlight ?? '',
    productBays: toProductBayInputs(initialProduct),
    rangeId: initialProduct?.rangeId ?? '',
    variantId: initialProduct?.variantId ?? '',
    requiresVinNumber: initialProduct?.requiresVinNumber ?? false,
    brochureEnabled: initialProduct?.brochureEnabled ?? false,
    landerEnabled: initialProduct?.landerEnabled ?? false,
    thumbnailDataUrl: initialProduct?.thumbnailDataUrl ?? null,
  };
}

/** Maps a product's stored assemblies into the editor's input shape. */
export function toProductAssemblyInputs(initialProduct?: Product): ProductAssemblyFormInput[] {
  return (initialProduct?.assemblies ?? []).map((assembly) =>
    assembly.kind === 'standard'
      ? {
          id: assembly.id,
          kind: assembly.kind,
          name: assembly.name,
          parts: assembly.parts,
        }
      : {
          id: assembly.id,
          kind: assembly.kind,
          name: assembly.name,
          overrideStandardAssemblyIds: assembly.overrideStandardAssemblyIds,
          parts: assembly.parts,
          price: assembly.price,
        },
  );
}

export function toProductBayInputs(initialProduct?: Product): ProductBayFormInput[] {
  return (initialProduct?.productBays ?? []).map((productBay) => ({
    bayId: productBay.bayId,
    defaultWorkingDays: productBay.defaultWorkingDays,
  }));
}

export function toProductCreateInput(value: ProductFormValues): ProductCreateInput {
  return ProductCreateInput.parse(toProductApiInput(value));
}

export function toProductMinimalCreateInput(value: ProductCreateFormValues): ProductCreateInput {
  return ProductCreateInput.parse(value);
}

export function toProductUpdateInput(id: UUIDType, value: ProductFormValues): ProductUpdateInput {
  return ProductUpdateInput.parse({
    ...toProductApiInput(value),
    id,
  });
}

function toProductApiInput(value: ProductFormValues) {
  return {
    ...value,
    variantId: value.variantId || null,
  };
}

/**
 * Catalogue assembly names eligible to suggest for one assembly's name field: every catalogue name
 * except those already used by the product's other assemblies (`excludedNames`, matched
 * case-insensitively against live form state). De-duping, alphabetical ordering, and substring
 * filtering are left to the shared `CreatableComboboxField` that renders these options.
 */
export function getEligibleAssemblyNames(names: readonly string[], excludedNames: readonly string[]): string[] {
  const excluded = new Set(excludedNames.map((name) => name.trim().toLowerCase()).filter(Boolean));

  return names.filter((name) => !excluded.has(name.trim().toLowerCase()));
}
