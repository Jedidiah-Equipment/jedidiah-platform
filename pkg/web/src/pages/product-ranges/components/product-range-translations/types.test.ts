import type { CatalogProductRangeTranslation, CatalogProductRangeVariantTranslation } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  getProductRangeTranslationManualFields,
  type ProductRangeTranslationBundle,
  toProductRangeTranslationFormValues,
  toProductRangeTranslationPatch,
  toProductRangeTranslationTogglePatch,
} from './types.js';

const rangeTranslation = {
  fields: {
    description: {
      canonical: 'Built for harvest.',
      state: 'needsReview',
      translation: envelope('Gebou vir die oes.', true),
    },
    name: {
      canonical: 'Harvest Range',
      state: 'fresh',
      translation: envelope('Oesreeks', false),
    },
  },
  id: '123e4567-e89b-42d3-a456-426614174000',
} satisfies CatalogProductRangeTranslation;

const variantTranslations = [
  {
    fields: {
      name: {
        canonical: 'Heavy Duty',
        state: 'fresh',
        translation: envelope('Swaardiens', true),
      },
    },
    id: '123e4567-e89b-42d3-a456-426614174001',
  },
  {
    fields: {
      name: {
        canonical: 'Compact',
        state: 'fresh',
        translation: envelope('Kompak', false),
      },
    },
    id: '123e4567-e89b-42d3-a456-426614174002',
  },
] satisfies CatalogProductRangeVariantTranslation[];
const manualVariant = variantTranslations[0];
const aiVariant = variantTranslations[1];
if (!manualVariant || !aiVariant) throw new Error('Variant fixtures missing');

const bundle: ProductRangeTranslationBundle = { range: rangeTranslation, variants: variantTranslations };

describe('Product Range translation form mapping', () => {
  it('maps the Range fields and every Variant name into one editing surface', () => {
    expect(toProductRangeTranslationFormValues(bundle)).toEqual({
      fields: { description: 'Gebou vir die oes.', name: 'Oesreeks' },
      variants: [
        { id: manualVariant.id, name: 'Swaardiens' },
        { id: aiVariant.id, name: 'Kompak' },
      ],
    });
  });

  it('patches only changed manual Range and Variant fields during autosave', () => {
    const initial = toProductRangeTranslationFormValues(bundle);
    const current = structuredClone(initial);
    const firstVariant = current.variants[0];
    const secondVariant = current.variants[1];
    if (!firstVariant || !secondVariant) throw new Error('Mapped Variant values missing');
    current.fields.description = 'Hersiene beskrywing.';
    current.fields.name = 'Must remain AI managed';
    firstVariant.name = 'Swaar diens';
    secondVariant.name = 'Must remain AI managed';

    expect(toProductRangeTranslationPatch(bundle, initial, current)).toEqual({
      range: {
        fields: { description: { isManual: true, value: 'Hersiene beskrywing.' } },
        id: rangeTranslation.id,
      },
      variants: [
        {
          fields: { name: { isManual: true, value: 'Swaar diens' } },
          id: manualVariant.id,
        },
      ],
    });
  });

  it('re-saves an unchanged manual field after a user reviews it', () => {
    const values = toProductRangeTranslationFormValues(bundle);
    const reviewedValues = {
      ...values,
      reviewedTarget: { field: 'description', kind: 'range' } as const,
    };

    expect(toProductRangeTranslationPatch(bundle, values, reviewedValues)).toEqual({
      range: {
        fields: { description: { isManual: true, value: 'Gebou vir die oes.' } },
        id: rangeTranslation.id,
      },
      variants: [],
    });
  });

  it('builds immediate enable and confirmed revert patches for Range and Variant fields', () => {
    const values = toProductRangeTranslationFormValues(bundle);

    expect(getProductRangeTranslationManualFields(bundle)).toEqual({
      fields: { description: true, name: false },
      variants: {
        [manualVariant.id]: true,
        [aiVariant.id]: false,
      },
    });
    expect(
      toProductRangeTranslationTogglePatch(values, { field: 'name', kind: 'range' }, true, rangeTranslation.id),
    ).toEqual({
      range: { fields: { name: { isManual: true, value: 'Oesreeks' } }, id: rangeTranslation.id },
      variants: [],
    });
    expect(
      toProductRangeTranslationTogglePatch(
        values,
        { kind: 'variant', variantId: manualVariant.id },
        false,
        rangeTranslation.id,
      ),
    ).toEqual({
      variants: [
        {
          fields: { name: { isManual: false } },
          id: manualVariant.id,
        },
      ],
    });
  });
});

function envelope<Value>(value: Value, isManual: boolean) {
  return {
    isManual,
    sourceHash: 'source-hash',
    translatedAt: '2026-07-14T12:00:00.000Z',
    value,
  };
}
