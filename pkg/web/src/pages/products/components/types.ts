import {
  AssemblyName,
  AssemblyPart,
  NullableThumbnailDataUrl,
  Price,
  type Product,
  ProductBuildTimeDays,
  ProductDescription,
  ProductModelCode,
  ProductName,
  refineProductAssemblies,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/form-schema.js';

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

const ProductFormFields = z.object({
  basePrice: Price,
  currencyCode: z.literal('ZAR'),
  description: emptyStringOr(ProductDescription),
  buildTimeDays: ProductBuildTimeDays,
  modelCode: ProductModelCode,
  name: ProductName,
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

export type ProductFormValues = z.infer<typeof ProductFormValues>;
export const ProductFormValues = ProductFormFields.extend({
  assemblies: z.array(ProductAssemblyFormInput).superRefine(refineProductAssemblies),
});

export const emptyProductFormValues: ProductFormValues = {
  assemblies: [],
  basePrice: NaN,
  currencyCode: 'ZAR',
  description: '',
  buildTimeDays: NaN,
  modelCode: '',
  name: '',
  thumbnailDataUrl: null,
};

/** Schema → form. `basePrice`/`buildTimeDays` use `NaN` so a missing number reads as empty. */
export function toProductFormValues(initialProduct?: Product): ProductFormValues {
  return {
    assemblies: toProductAssemblyInputs(initialProduct),
    basePrice: initialProduct?.basePrice ?? NaN,
    currencyCode: initialProduct?.currencyCode ?? 'ZAR',
    description: initialProduct?.description ?? '',
    buildTimeDays: initialProduct?.buildTimeDays ?? NaN,
    modelCode: initialProduct?.modelCode ?? '',
    name: initialProduct?.name ?? '',
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
