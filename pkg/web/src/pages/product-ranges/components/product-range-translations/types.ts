import {
  type CatalogProductRangeTranslation,
  type CatalogProductRangeTranslationPatchInput,
  type CatalogProductRangeVariantTranslation,
  type CatalogProductRangeVariantTranslationPatchInput,
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
  variants: z.array(z.object({ id: UUID, name: TranslatableProductRangeVariantFields.shape.name })),
  // Keeping review intent in the form snapshot makes an unchanged reviewed value observable to autosave.
  reviewedTarget: ProductRangeTranslationTargetSchema.optional(),
});

export type ProductRangeTranslationFormValues = z.infer<typeof ProductRangeTranslationFormValuesSchema>;
export type ProductRangeTranslationTarget = z.infer<typeof ProductRangeTranslationTargetSchema>;

export type ProductRangeTranslationBundle = {
  range: CatalogProductRangeTranslation;
  variants: CatalogProductRangeVariantTranslation[];
};

export type ProductRangeTranslationManualFields = {
  fields: Record<keyof ProductRangeTranslationFormValues['fields'], boolean>;
  variants: Record<UUID, boolean>;
};

export type ProductRangeTranslationPatch = {
  range?: CatalogProductRangeTranslationPatchInput;
  variants: CatalogProductRangeVariantTranslationPatchInput[];
};

export function toProductRangeTranslationFormValues(
  translation: ProductRangeTranslationBundle,
): ProductRangeTranslationFormValues {
  return {
    fields: {
      description: translation.range.fields.description.translation?.value ?? '',
      name: translation.range.fields.name.translation?.value ?? '',
    },
    variants: translation.variants.map((variant) => ({
      id: variant.id,
      name: variant.fields.name.translation?.value ?? '',
    })),
  };
}

export function getProductRangeTranslationManualFields(
  translation: ProductRangeTranslationBundle,
): ProductRangeTranslationManualFields {
  return {
    fields: {
      description: translation.range.fields.description.translation?.isManual === true,
      name: translation.range.fields.name.translation?.isManual === true,
    },
    variants: Object.fromEntries(
      translation.variants.map((variant) => [variant.id, variant.fields.name.translation?.isManual === true]),
    ),
  };
}

export function toProductRangeTranslationPatch(
  translation: ProductRangeTranslationBundle,
  initial: ProductRangeTranslationFormValues,
  current: ProductRangeTranslationFormValues,
): ProductRangeTranslationPatch {
  const manual = getProductRangeTranslationManualFields(translation);
  const fields: CatalogProductRangeTranslationPatchInput['fields'] = {};

  addChangedManualRangeField(
    fields,
    manual,
    initial,
    current,
    'name',
    current.fields.name,
    shouldResaveRangeField(translation, current.reviewedTarget, 'name'),
  );
  addChangedManualRangeField(
    fields,
    manual,
    initial,
    current,
    'description',
    emptyStringToNull(current.fields.description),
    shouldResaveRangeField(translation, current.reviewedTarget, 'description'),
  );

  const initialVariants = new Map(initial.variants.map((variant) => [variant.id, variant.name]));
  const variants = current.variants.flatMap((variant) =>
    manual.variants[variant.id] &&
    (initialVariants.get(variant.id) !== variant.name ||
      shouldResaveVariant(translation, current.reviewedTarget, variant.id))
      ? [{ fields: { name: { isManual: true as const, value: variant.name } }, id: variant.id }]
      : [],
  );

  return {
    ...(Object.keys(fields).length > 0 ? { range: { fields, id: translation.range.id } } : {}),
    variants,
  };
}

export function toProductRangeTranslationTogglePatch(
  values: ProductRangeTranslationFormValues,
  target: ProductRangeTranslationTarget,
  isManual: boolean,
  rangeId: UUID,
): ProductRangeTranslationPatch {
  if (target.kind === 'variant') {
    const value = values.variants.find((variant) => variant.id === target.variantId)?.name ?? '';
    return {
      variants: [
        {
          fields: { name: isManual ? { isManual: true, value } : { isManual: false } },
          id: target.variantId,
        },
      ],
    };
  }

  const value = values.fields[target.field];
  const normalizedValue = target.field === 'description' && value === '' ? null : value;
  return {
    range: {
      fields: {
        [target.field]: isManual ? { isManual: true, value: normalizedValue } : { isManual: false },
      } as CatalogProductRangeTranslationPatchInput['fields'],
      id: rangeId,
    },
    variants: [],
  };
}

function addChangedManualRangeField<Field extends keyof ProductRangeTranslationFormValues['fields']>(
  fields: CatalogProductRangeTranslationPatchInput['fields'],
  manual: ProductRangeTranslationManualFields,
  initial: ProductRangeTranslationFormValues,
  current: ProductRangeTranslationFormValues,
  field: Field,
  value: ProductRangeTranslationFormValues['fields'][Field] | null,
  force: boolean,
) {
  if (!manual.fields[field] || (!force && initial.fields[field] === current.fields[field])) return;
  Object.assign(fields, { [field]: { isManual: true, value } });
}

function shouldResaveRangeField(
  translation: ProductRangeTranslationBundle,
  target: ProductRangeTranslationTarget | undefined,
  field: keyof ProductRangeTranslationFormValues['fields'],
): boolean {
  return target?.kind === 'range' && target.field === field && translation.range.fields[field].state === 'needsReview';
}

function shouldResaveVariant(
  translation: ProductRangeTranslationBundle,
  target: ProductRangeTranslationTarget | undefined,
  variantId: UUID,
): boolean {
  return (
    target?.kind === 'variant' &&
    target.variantId === variantId &&
    translation.variants.find((variant) => variant.id === variantId)?.fields.name.state === 'needsReview'
  );
}

function emptyStringToNull(value: string): string | null {
  return value === '' ? null : value;
}
