import {
  type CatalogProductRangeTranslation,
  type CatalogProductRangeTranslationPatchInput,
  type CatalogTranslationFieldState,
  TranslatableProductRangeFields,
  TranslatableProductRangeVariantFields,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

const ProductRangeTranslationTargetSchema = z.discriminatedUnion('kind', [
  z.object({ field: z.enum(['description', 'name']), kind: z.literal('range') }),
  z.object({ kind: z.literal('variant'), variantId: UUID }),
]);

export const ProductRangeTranslationFormValuesSchema = z.object({
  fields: z.object({
    description: emptyStringOr(TranslatableProductRangeFields.shape.description),
    name: TranslatableProductRangeFields.shape.name,
  }),
  // Keeping review intent in the form snapshot makes an unchanged reviewed value observable to autosave.
  reviewedTarget: ProductRangeTranslationTargetSchema.optional(),
  variants: z.array(z.object({ id: UUID, name: TranslatableProductRangeVariantFields.shape.name })),
});

export type ProductRangeTranslationFormValues = z.infer<typeof ProductRangeTranslationFormValuesSchema>;
export type ProductRangeTranslationTarget = z.infer<typeof ProductRangeTranslationTargetSchema>;

export function toProductRangeTranslationFormValues(
  translation: CatalogProductRangeTranslation,
): ProductRangeTranslationFormValues {
  return {
    fields: {
      description: translation.fields.description.translation?.value ?? '',
      name: translation.fields.name.translation?.value ?? '',
    },
    variants: translation.variants.map((variant) => ({
      id: variant.id,
      name: variant.fields.name.translation?.value ?? '',
    })),
  };
}

export function isProductRangeTranslationTargetManual(
  translation: CatalogProductRangeTranslation,
  target: ProductRangeTranslationTarget,
): boolean {
  return getTargetField(translation, target)?.translation?.isManual === true;
}

export function getProductRangeTranslationTargetState(
  translation: CatalogProductRangeTranslation,
  target: ProductRangeTranslationTarget,
): CatalogTranslationFieldState | undefined {
  return getTargetField(translation, target)?.state;
}

export function toProductRangeTranslationPatch(
  translation: CatalogProductRangeTranslation,
  initial: ProductRangeTranslationFormValues,
  current: ProductRangeTranslationFormValues,
): CatalogProductRangeTranslationPatchInput {
  const fields: NonNullable<CatalogProductRangeTranslationPatchInput['fields']> = {};
  if (shouldSaveRangeField(translation, initial, current, 'name')) {
    fields.name = { isManual: true, value: current.fields.name };
  }
  if (shouldSaveRangeField(translation, initial, current, 'description')) {
    fields.description = { isManual: true, value: emptyStringToNull(current.fields.description) };
  }

  const initialVariants = new Map(initial.variants.map((variant) => [variant.id, variant.name]));
  const variants = current.variants.flatMap((variant) => {
    const target = { kind: 'variant', variantId: variant.id } as const;
    if (!isProductRangeTranslationTargetManual(translation, target)) return [];
    const changed = initialVariants.get(variant.id) !== variant.name;
    if (!changed && !isReviewedTarget(translation, current.reviewedTarget, target)) return [];
    return [{ fields: { name: { isManual: true as const, value: variant.name } }, id: variant.id }];
  });

  return {
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    id: translation.id,
    ...(variants.length > 0 ? { variants } : {}),
  };
}

export function toProductRangeTranslationTogglePatch(
  rangeId: UUID,
  values: ProductRangeTranslationFormValues,
  target: ProductRangeTranslationTarget,
  isManual: boolean,
): CatalogProductRangeTranslationPatchInput {
  if (target.kind === 'variant') {
    const value = values.variants.find((variant) => variant.id === target.variantId)?.name ?? '';
    return {
      id: rangeId,
      variants: [
        { fields: { name: isManual ? { isManual: true, value } : { isManual: false } }, id: target.variantId },
      ],
    };
  }

  const fields: NonNullable<CatalogProductRangeTranslationPatchInput['fields']> =
    target.field === 'name'
      ? { name: isManual ? { isManual: true, value: values.fields.name } : { isManual: false } }
      : {
          description: isManual
            ? { isManual: true, value: emptyStringToNull(values.fields.description) }
            : { isManual: false },
        };

  return { fields, id: rangeId };
}

function getTargetField(translation: CatalogProductRangeTranslation, target: ProductRangeTranslationTarget) {
  return target.kind === 'range'
    ? translation.fields[target.field]
    : translation.variants.find((variant) => variant.id === target.variantId)?.fields.name;
}

function shouldSaveRangeField(
  translation: CatalogProductRangeTranslation,
  initial: ProductRangeTranslationFormValues,
  current: ProductRangeTranslationFormValues,
  field: keyof ProductRangeTranslationFormValues['fields'],
): boolean {
  const target = { field, kind: 'range' } as const;
  if (!isProductRangeTranslationTargetManual(translation, target)) return false;
  return (
    initial.fields[field] !== current.fields[field] || isReviewedTarget(translation, current.reviewedTarget, target)
  );
}

// Re-saving a field the admin just looked at is what clears its needs-review flag, so an unchanged value
// still has to reach the server.
function isReviewedTarget(
  translation: CatalogProductRangeTranslation,
  reviewed: ProductRangeTranslationTarget | undefined,
  target: ProductRangeTranslationTarget,
): boolean {
  if (!reviewed) return false;
  const isSameTarget =
    reviewed.kind === 'range' && target.kind === 'range'
      ? reviewed.field === target.field
      : reviewed.kind === 'variant' && target.kind === 'variant' && reviewed.variantId === target.variantId;

  return isSameTarget && getProductRangeTranslationTargetState(translation, target) === 'needsReview';
}

function emptyStringToNull(value: string): string | null {
  return value === '' ? null : value;
}
