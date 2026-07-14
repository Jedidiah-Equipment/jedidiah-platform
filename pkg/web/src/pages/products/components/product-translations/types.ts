import {
  type CatalogProductTranslation,
  type CatalogProductTranslationPatchInput,
  TranslatableAssemblyFields,
  TranslatableProductFields,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

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
});

export type ProductTranslationFormValues = z.infer<typeof ProductTranslationFormValuesSchema>;

export type ProductTranslationTarget =
  | { field: keyof ProductTranslationFormValues['fields']; kind: 'product' }
  | { assemblyId: UUID; kind: 'assembly' };

export type ProductTranslationManualFields = {
  assemblies: Record<UUID, boolean>;
  fields: Record<keyof ProductTranslationFormValues['fields'], boolean>;
};

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

export function getProductTranslationManualFields(
  translation: CatalogProductTranslation,
): ProductTranslationManualFields {
  return {
    assemblies: Object.fromEntries(
      translation.assemblies.map((assembly) => [assembly.id, assembly.fields.name.translation?.isManual === true]),
    ),
    fields: {
      category: translation.fields.category.translation?.isManual === true,
      description: translation.fields.description.translation?.isManual === true,
      keyFeatures: translation.fields.keyFeatures.translation?.isManual === true,
      name: translation.fields.name.translation?.isManual === true,
      nameHighlight: translation.fields.nameHighlight.translation?.isManual === true,
      technicalDetails: translation.fields.technicalDetails.translation?.isManual === true,
    },
  };
}

export function toProductTranslationPatch(
  translation: CatalogProductTranslation,
  initial: ProductTranslationFormValues,
  current: ProductTranslationFormValues,
  reviewedTarget?: ProductTranslationTarget,
): CatalogProductTranslationPatchInput {
  const manual = getProductTranslationManualFields(translation);
  const fields: NonNullable<CatalogProductTranslationPatchInput['fields']> = {};

  addChangedManualProductField(
    fields,
    manual,
    initial,
    current,
    'name',
    current.fields.name,
    shouldResaveProductField(translation, reviewedTarget, 'name'),
  );
  addChangedManualProductField(
    fields,
    manual,
    initial,
    current,
    'nameHighlight',
    emptyStringToNull(current.fields.nameHighlight),
    shouldResaveProductField(translation, reviewedTarget, 'nameHighlight'),
  );
  addChangedManualProductField(
    fields,
    manual,
    initial,
    current,
    'category',
    emptyStringToNull(current.fields.category),
    shouldResaveProductField(translation, reviewedTarget, 'category'),
  );
  addChangedManualProductField(
    fields,
    manual,
    initial,
    current,
    'description',
    emptyStringToNull(current.fields.description),
    shouldResaveProductField(translation, reviewedTarget, 'description'),
  );
  addChangedManualProductField(
    fields,
    manual,
    initial,
    current,
    'keyFeatures',
    current.fields.keyFeatures,
    shouldResaveProductField(translation, reviewedTarget, 'keyFeatures'),
  );
  addChangedManualProductField(
    fields,
    manual,
    initial,
    current,
    'technicalDetails',
    current.fields.technicalDetails,
    shouldResaveProductField(translation, reviewedTarget, 'technicalDetails'),
  );

  const initialAssemblies = new Map(initial.assemblies.map((assembly) => [assembly.id, assembly.name]));
  const assemblies = current.assemblies.flatMap((assembly) =>
    manual.assemblies[assembly.id] &&
    (initialAssemblies.get(assembly.id) !== assembly.name ||
      shouldResaveAssembly(translation, reviewedTarget, assembly.id))
      ? [{ fields: { name: { isManual: true as const, value: assembly.name } }, id: assembly.id }]
      : [],
  );

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
        {
          fields: { name: isManual ? { isManual: true, value } : { isManual: false } },
          id: target.assemblyId,
        },
      ],
      id: productId,
    };
  }

  return {
    fields: productFieldTogglePatch(target.field, values.fields[target.field], isManual),
    id: productId,
  };
}

function addChangedManualProductField<Field extends keyof ProductTranslationFormValues['fields']>(
  fields: NonNullable<CatalogProductTranslationPatchInput['fields']>,
  manual: ProductTranslationManualFields,
  initial: ProductTranslationFormValues,
  current: ProductTranslationFormValues,
  field: Field,
  value: ProductTranslationFormValues['fields'][Field] | null,
  force: boolean,
) {
  if (!manual.fields[field] || (!force && valuesEqual(initial.fields[field], current.fields[field]))) return;

  Object.assign(fields, { [field]: { isManual: true, value } });
}

function shouldResaveProductField(
  translation: CatalogProductTranslation,
  target: ProductTranslationTarget | undefined,
  field: keyof ProductTranslationFormValues['fields'],
): boolean {
  return target?.kind === 'product' && target.field === field && translation.fields[field].state === 'needsReview';
}

function shouldResaveAssembly(
  translation: CatalogProductTranslation,
  target: ProductTranslationTarget | undefined,
  assemblyId: UUID,
): boolean {
  return (
    target?.kind === 'assembly' &&
    target.assemblyId === assemblyId &&
    translation.assemblies.find((assembly) => assembly.id === assemblyId)?.fields.name.state === 'needsReview'
  );
}

function productFieldTogglePatch(
  field: keyof ProductTranslationFormValues['fields'],
  value: ProductTranslationFormValues['fields'][keyof ProductTranslationFormValues['fields']],
  isManual: boolean,
): NonNullable<CatalogProductTranslationPatchInput['fields']> {
  if (!isManual) return { [field]: { isManual: false } };

  const normalizedValue =
    (field === 'nameHighlight' || field === 'category' || field === 'description') && value === '' ? null : value;
  return { [field]: { isManual: true, value: normalizedValue } } as NonNullable<
    CatalogProductTranslationPatchInput['fields']
  >;
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
