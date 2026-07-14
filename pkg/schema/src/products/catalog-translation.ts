import { z } from 'zod';

import { UUID } from '../common/uuid.js';

const CatalogTranslationEnvelopeMetadata = z.object({
  isManual: z.boolean(),
  sourceHash: z.string(),
  translatedAt: z.iso.datetime({ offset: true }),
});

export type CatalogTranslationEnvelope<Value> = {
  isManual: boolean;
  sourceHash: string;
  translatedAt: string;
  value: Value;
};

export function catalogTranslationEnvelope<ValueSchema extends z.ZodType>(value: ValueSchema) {
  return CatalogTranslationEnvelopeMetadata.extend({ value });
}

export type CatalogTranslationFieldState = z.infer<typeof CatalogTranslationFieldState>;
export const CatalogTranslationFieldState = z.enum(['fresh', 'missing', 'needsReview', 'stale']);

function catalogTranslationField<ValueSchema extends z.ZodType>(value: ValueSchema) {
  return z.object({
    canonical: value,
    state: CatalogTranslationFieldState,
    translation: catalogTranslationEnvelope(value).optional(),
  });
}

function catalogTranslationFieldPatch<ValueSchema extends z.ZodType>(value: ValueSchema) {
  return z.discriminatedUnion('isManual', [
    z.object({ isManual: z.literal(true), value }),
    z.object({ isManual: z.literal(false) }),
  ]);
}

// The translatable fields of each catalog entity, declared once. Stored translation shapes, the AI
// translation I/O, and the source hashes all derive from these.
export type TranslatableProductFields = z.infer<typeof TranslatableProductFields>;
export const TranslatableProductFields = z.object({
  name: z.string(),
  nameHighlight: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  keyFeatures: z.array(z.string()),
  technicalDetails: z.array(z.object({ label: z.string(), value: z.string() })),
});

export type TranslatableAssemblyFields = z.infer<typeof TranslatableAssemblyFields>;
export const TranslatableAssemblyFields = z.object({
  name: z.string(),
});

// Assembly identity plus its translatable fields: the per-assembly unit the product translation bundle
// round-trips (ids pass through verbatim, names translate).
export type TranslatableAssembly = z.infer<typeof TranslatableAssembly>;
export const TranslatableAssembly = TranslatableAssemblyFields.extend({ id: UUID });

export type TranslatableProductRangeFields = z.infer<typeof TranslatableProductRangeFields>;
export const TranslatableProductRangeFields = z.object({
  name: z.string(),
  description: z.string().nullable(),
});

export type TranslatableProductRangeVariantFields = z.infer<typeof TranslatableProductRangeVariantFields>;
export const TranslatableProductRangeVariantFields = z.object({
  name: z.string(),
});

const ProductTranslationFields = z.object({
  name: catalogTranslationField(TranslatableProductFields.shape.name),
  nameHighlight: catalogTranslationField(TranslatableProductFields.shape.nameHighlight),
  category: catalogTranslationField(TranslatableProductFields.shape.category),
  description: catalogTranslationField(TranslatableProductFields.shape.description),
  keyFeatures: catalogTranslationField(TranslatableProductFields.shape.keyFeatures),
  technicalDetails: catalogTranslationField(TranslatableProductFields.shape.technicalDetails),
});

const ProductTranslationFieldPatches = z
  .object({
    name: catalogTranslationFieldPatch(TranslatableProductFields.shape.name),
    nameHighlight: catalogTranslationFieldPatch(TranslatableProductFields.shape.nameHighlight),
    category: catalogTranslationFieldPatch(TranslatableProductFields.shape.category),
    description: catalogTranslationFieldPatch(TranslatableProductFields.shape.description),
    keyFeatures: catalogTranslationFieldPatch(TranslatableProductFields.shape.keyFeatures),
    technicalDetails: catalogTranslationFieldPatch(TranslatableProductFields.shape.technicalDetails),
  })
  .partial();

const AssemblyTranslationFields = z.object({
  name: catalogTranslationField(TranslatableAssemblyFields.shape.name),
});

const AssemblyTranslationFieldPatches = z
  .object({ name: catalogTranslationFieldPatch(TranslatableAssemblyFields.shape.name) })
  .partial();

export type CatalogProductTranslation = z.infer<typeof CatalogProductTranslation>;
export const CatalogProductTranslation = z.object({
  assemblies: z.array(z.object({ fields: AssemblyTranslationFields, id: UUID })),
  fields: ProductTranslationFields,
  id: UUID,
});

export type CatalogProductTranslationPatchInput = z.infer<typeof CatalogProductTranslationPatchInput>;
export const CatalogProductTranslationPatchInput = z.object({
  assemblies: z.array(z.object({ fields: AssemblyTranslationFieldPatches, id: UUID })).optional(),
  fields: ProductTranslationFieldPatches.optional(),
  id: UUID,
});

const ProductRangeTranslationFields = z.object({
  name: catalogTranslationField(TranslatableProductRangeFields.shape.name),
  description: catalogTranslationField(TranslatableProductRangeFields.shape.description),
});

const ProductRangeTranslationFieldPatches = z
  .object({
    name: catalogTranslationFieldPatch(TranslatableProductRangeFields.shape.name),
    description: catalogTranslationFieldPatch(TranslatableProductRangeFields.shape.description),
  })
  .partial();

export type CatalogProductRangeTranslation = z.infer<typeof CatalogProductRangeTranslation>;
export const CatalogProductRangeTranslation = z.object({
  fields: ProductRangeTranslationFields,
  id: UUID,
});

export type CatalogProductRangeTranslationPatchInput = z.infer<typeof CatalogProductRangeTranslationPatchInput>;
export const CatalogProductRangeTranslationPatchInput = z.object({
  fields: ProductRangeTranslationFieldPatches,
  id: UUID,
});

const ProductRangeVariantTranslationFields = z.object({
  name: catalogTranslationField(TranslatableProductRangeVariantFields.shape.name),
});

const ProductRangeVariantTranslationFieldPatches = z
  .object({ name: catalogTranslationFieldPatch(TranslatableProductRangeVariantFields.shape.name) })
  .partial();

export type CatalogProductRangeVariantTranslation = z.infer<typeof CatalogProductRangeVariantTranslation>;
export const CatalogProductRangeVariantTranslation = z.object({
  fields: ProductRangeVariantTranslationFields,
  id: UUID,
});

export type CatalogProductRangeVariantTranslationPatchInput = z.infer<
  typeof CatalogProductRangeVariantTranslationPatchInput
>;
export const CatalogProductRangeVariantTranslationPatchInput = z.object({
  fields: ProductRangeVariantTranslationFieldPatches,
  id: UUID,
});

const CatalogTranslationStatusCounts = z.object({
  missing: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
});

export type CatalogTranslationStatus = z.infer<typeof CatalogTranslationStatus>;
export const CatalogTranslationStatus = z.object({
  products: CatalogTranslationStatusCounts,
  ranges: CatalogTranslationStatusCounts,
  variants: CatalogTranslationStatusCounts,
});
