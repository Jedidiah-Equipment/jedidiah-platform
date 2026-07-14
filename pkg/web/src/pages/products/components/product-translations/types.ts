import {
  type CatalogProductTranslation,
  type CatalogProductTranslationPatchInput,
  type CatalogTranslationFieldState,
  TranslatableAssemblyFields,
  TranslatableProductFields,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

const ProductTranslationTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    field: z.enum(['category', 'description', 'keyFeatures', 'name', 'nameHighlight', 'technicalDetails']),
    kind: z.literal('product'),
  }),
  z.object({ assemblyId: UUID, kind: z.literal('assembly') }),
]);

export const ProductTranslationFormValuesSchema = z.object({
  assemblies: z.array(z.object({ id: UUID, name: TranslatableAssemblyFields.shape.name })),
  fields: z.object({
    category: emptyStringOr(TranslatableProductFields.shape.category),
    description: emptyStringOr(TranslatableProductFields.shape.description),
    keyFeatures: TranslatableProductFields.shape.keyFeatures,
    name: TranslatableProductFields.shape.name,
    nameHighlight: emptyStringOr(TranslatableProductFields.shape.nameHighlight),
    technicalDetails: TranslatableProductFields.shape.technicalDetails,
  }),
  // Review intent belongs in the snapshot so unchanged values still trigger autosave.
  reviewedTarget: ProductTranslationTargetSchema.optional(),
});

export type ProductTranslationFormValues = z.infer<typeof ProductTranslationFormValuesSchema>;
export type ProductTranslationTarget = z.infer<typeof ProductTranslationTargetSchema>;

type ProductTranslationField = keyof ProductTranslationFormValues['fields'];
type ProductFieldPatches = NonNullable<CatalogProductTranslationPatchInput['fields']>;

const PRODUCT_TRANSLATION_FIELDS = [
  'name',
  'nameHighlight',
  'category',
  'description',
  'keyFeatures',
  'technicalDetails',
] as const satisfies readonly ProductTranslationField[];

export function toProductTranslationFormValues(translation: CatalogProductTranslation): ProductTranslationFormValues {
  return {
    assemblies: translation.assemblies.map((assembly) => ({
      id: assembly.id,
      name: assembly.fields.name.translation?.value ?? '',
    })),
    fields: {
      category: translation.fields.category.translation?.value ?? '',
      description: translation.fields.description.translation?.value ?? '',
      keyFeatures: mirrorStringList(
        translation.fields.keyFeatures.canonical,
        translation.fields.keyFeatures.translation?.value,
      ),
      name: translation.fields.name.translation?.value ?? '',
      nameHighlight: translation.fields.nameHighlight.translation?.value ?? '',
      technicalDetails: mirrorTechnicalDetails(
        translation.fields.technicalDetails.canonical,
        translation.fields.technicalDetails.translation?.value,
      ),
    },
  };
}

export function isProductTranslationTargetManual(
  translation: CatalogProductTranslation,
  target: ProductTranslationTarget,
): boolean {
  return getTargetField(translation, target)?.translation?.isManual === true;
}

export function getProductTranslationTargetState(
  translation: CatalogProductTranslation,
  target: ProductTranslationTarget,
): CatalogTranslationFieldState | undefined {
  return getTargetField(translation, target)?.state;
}

export function toProductTranslationPatch(
  translation: CatalogProductTranslation,
  initial: ProductTranslationFormValues,
  current: ProductTranslationFormValues,
): CatalogProductTranslationPatchInput {
  const fields: ProductFieldPatches = {};
  for (const field of PRODUCT_TRANSLATION_FIELDS) {
    const target = { field, kind: 'product' } as const;
    if (!isProductTranslationTargetManual(translation, target)) continue;
    const changed = !valuesEqual(initial.fields[field], current.fields[field]);
    if (!changed && !isReviewedTarget(translation, current.reviewedTarget, target)) continue;
    Object.assign(fields, productFieldPatch(field, current.fields));
  }

  const initialAssemblies = new Map(initial.assemblies.map((assembly) => [assembly.id, assembly.name]));
  const assemblies = current.assemblies.flatMap((assembly) => {
    const target = { assemblyId: assembly.id, kind: 'assembly' } as const;
    if (!isProductTranslationTargetManual(translation, target)) return [];
    const changed = initialAssemblies.get(assembly.id) !== assembly.name;
    if (!changed && !isReviewedTarget(translation, current.reviewedTarget, target)) return [];
    return [{ fields: { name: { isManual: true as const, value: assembly.name } }, id: assembly.id }];
  });

  return {
    ...(assemblies.length > 0 ? { assemblies } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    id: translation.id,
  };
}

export function toProductTranslationTogglePatch(
  productId: UUID,
  values: ProductTranslationFormValues,
  target: ProductTranslationTarget,
  isManual: boolean,
): CatalogProductTranslationPatchInput {
  if (target.kind === 'assembly') {
    const value = values.assemblies.find((assembly) => assembly.id === target.assemblyId)?.name ?? '';
    return {
      assemblies: [
        { fields: { name: isManual ? { isManual: true, value } : { isManual: false } }, id: target.assemblyId },
      ],
      id: productId,
    };
  }

  const fields: ProductFieldPatches = {};
  Object.assign(
    fields,
    isManual ? productFieldPatch(target.field, values.fields) : { [target.field]: { isManual: false } },
  );
  return { fields, id: productId };
}

// Nullable fields clear to null on an empty input; the rest pass their form value straight through. The
// switch keeps each field's value type tied to its own patch shape without a cast.
function productFieldPatch(
  field: ProductTranslationField,
  values: ProductTranslationFormValues['fields'],
): ProductFieldPatches {
  switch (field) {
    case 'category':
      return { category: { isManual: true, value: emptyStringToNull(values.category) } };
    case 'description':
      return { description: { isManual: true, value: emptyStringToNull(values.description) } };
    case 'keyFeatures':
      return { keyFeatures: { isManual: true, value: values.keyFeatures } };
    case 'name':
      return { name: { isManual: true, value: values.name } };
    case 'nameHighlight':
      return { nameHighlight: { isManual: true, value: emptyStringToNull(values.nameHighlight) } };
    case 'technicalDetails':
      return { technicalDetails: { isManual: true, value: values.technicalDetails } };
  }
}

function getTargetField(translation: CatalogProductTranslation, target: ProductTranslationTarget) {
  return target.kind === 'product'
    ? translation.fields[target.field]
    : translation.assemblies.find((assembly) => assembly.id === target.assemblyId)?.fields.name;
}

// Re-saving a field the admin just looked at is what clears its needs-review flag, so an unchanged value
// still has to reach the server.
function isReviewedTarget(
  translation: CatalogProductTranslation,
  reviewed: ProductTranslationTarget | undefined,
  target: ProductTranslationTarget,
): boolean {
  if (!reviewed) return false;
  const isSameTarget =
    reviewed.kind === 'product' && target.kind === 'product'
      ? reviewed.field === target.field
      : reviewed.kind === 'assembly' && target.kind === 'assembly' && reviewed.assemblyId === target.assemblyId;

  return isSameTarget && getProductTranslationTargetState(translation, target) === 'needsReview';
}

function mirrorStringList(canonical: string[], translated: string[] | undefined): string[] {
  return canonical.map((_, index) => translated?.[index] ?? '');
}

function mirrorTechnicalDetails(
  canonical: Array<{ label: string; value: string }>,
  translated: Array<{ label: string; value: string }> | undefined,
): Array<{ label: string; value: string }> {
  return canonical.map((_, index) => ({
    label: translated?.[index]?.label ?? '',
    value: translated?.[index]?.value ?? '',
  }));
}

function emptyStringToNull(value: string): string | null {
  return value === '' ? null : value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
