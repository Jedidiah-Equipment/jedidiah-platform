import {
  AssemblyName,
  AssemblyPart,
  BrochureKeyFeatures,
  BrochureSubtitle,
  NullableThumbnailDataUrl,
  Price,
  type Product,
  ProductBayDefaultWorkingDays,
  ProductBayInput,
  ProductBuildTimeDays,
  ProductCreateInput,
  ProductDescription,
  ProductModelCode,
  ProductName,
  ProductRequiresVinNumber,
  ProductUpdateInput,
  refineProductAssemblies,
  refineProductBays,
  UUID,
  type UUID as UUIDType,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

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

// Form representation of the Brochure Config text fields. The subtitle holds `''` for "no value"
// like other nullable text inputs; key-feature lines reuse the schema-owned content + cap rules.
export type BrochureConfigFormValues = z.infer<typeof BrochureConfigFormValues>;
export const BrochureConfigFormValues = z.object({
  keyFeatures: BrochureKeyFeatures,
  subtitle: emptyStringOr(BrochureSubtitle),
});

const ProductFormFields = z.object({
  basePrice: Price,
  currencyCode: z.literal('ZAR'),
  description: emptyStringOr(ProductDescription),
  buildTimeDays: ProductBuildTimeDays,
  modelCode: ProductModelCode,
  name: ProductName,
  requiresVinNumber: ProductRequiresVinNumber,
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

export type ProductFormValues = z.infer<typeof ProductFormValues>;
export const ProductFormValues = ProductFormFields.extend({
  assemblies: z.array(ProductAssemblyFormInput).superRefine(refineProductAssemblies),
  brochureConfig: BrochureConfigFormValues,
  productBays: z.array(ProductBayFormInput).superRefine(refineProductBays),
});

export type ProductCreateFormValues = z.infer<typeof ProductCreateFormValues>;
export const ProductCreateFormValues = ProductFormFields.pick({
  basePrice: true,
  buildTimeDays: true,
  modelCode: true,
  name: true,
});

export const emptyProductFormValues: ProductFormValues = {
  assemblies: [],
  basePrice: NaN,
  brochureConfig: { keyFeatures: [], subtitle: '' },
  currencyCode: 'ZAR',
  description: '',
  buildTimeDays: NaN,
  modelCode: '',
  name: '',
  productBays: [],
  requiresVinNumber: false,
  thumbnailDataUrl: null,
};

/** Schema → form. `basePrice`/`buildTimeDays` use `NaN` so a missing number reads as empty. */
export function toProductFormValues(initialProduct?: Product): ProductFormValues {
  return {
    assemblies: toProductAssemblyInputs(initialProduct),
    basePrice: initialProduct?.basePrice ?? NaN,
    brochureConfig: toBrochureConfigFormValues(initialProduct),
    currencyCode: initialProduct?.currencyCode ?? 'ZAR',
    description: initialProduct?.description ?? '',
    buildTimeDays: initialProduct?.buildTimeDays ?? NaN,
    modelCode: initialProduct?.modelCode ?? '',
    name: initialProduct?.name ?? '',
    productBays: toProductBayInputs(initialProduct),
    requiresVinNumber: initialProduct?.requiresVinNumber ?? false,
    thumbnailDataUrl: initialProduct?.thumbnailDataUrl ?? null,
  };
}

/** Maps a product's stored Brochure Config text fields into the editor's input shape. */
export function toBrochureConfigFormValues(initialProduct?: Product): BrochureConfigFormValues {
  return {
    keyFeatures: initialProduct?.brochureConfig?.keyFeatures ?? [],
    subtitle: initialProduct?.brochureConfig?.subtitle ?? '',
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
  return ProductCreateInput.parse(value);
}

export function toProductMinimalCreateInput(value: ProductCreateFormValues): ProductCreateInput {
  return ProductCreateInput.parse(value);
}

export function toProductUpdateInput(id: UUIDType, value: ProductFormValues): ProductUpdateInput {
  return ProductUpdateInput.parse({
    ...toProductCreateInput(value),
    id,
  });
}
