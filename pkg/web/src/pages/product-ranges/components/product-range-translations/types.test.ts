import type { CatalogProductRangeTranslation } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  isProductRangeTranslationTargetManual,
  toProductRangeTranslationFormValues,
  toProductRangeTranslationPatch,
  toProductRangeTranslationTogglePatch,
} from './types.js';

const translation = {
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
  variants: [
    {
      fields: { name: { canonical: 'Heavy Duty', state: 'fresh', translation: envelope('Swaardiens', true) } },
      id: '123e4567-e89b-42d3-a456-426614174001',
    },
    {
      fields: { name: { canonical: 'Compact', state: 'fresh', translation: envelope('Kompak', false) } },
      id: '123e4567-e89b-42d3-a456-426614174002',
    },
  ],
} satisfies CatalogProductRangeTranslation;

const manualVariant = translation.variants[0];
const aiVariant = translation.variants[1];
if (!manualVariant || !aiVariant) throw new Error('Variant fixtures missing');

describe('Product Range translation form mapping', () => {
  it('maps the Range fields and every Variant name into one editing surface', () => {
    expect(toProductRangeTranslationFormValues(translation)).toEqual({
      fields: { description: 'Gebou vir die oes.', name: 'Oesreeks' },
      variants: [
        { id: manualVariant.id, name: 'Swaardiens' },
        { id: aiVariant.id, name: 'Kompak' },
      ],
    });
  });

  it('patches only changed manual Range and Variant fields during autosave', () => {
    const initial = toProductRangeTranslationFormValues(translation);
    const current = structuredClone(initial);
    const firstVariant = current.variants[0];
    const secondVariant = current.variants[1];
    if (!firstVariant || !secondVariant) throw new Error('Mapped Variant values missing');
    current.fields.description = 'Hersiene beskrywing.';
    current.fields.name = 'Must remain AI managed';
    firstVariant.name = 'Swaar diens';
    secondVariant.name = 'Must remain AI managed';

    expect(toProductRangeTranslationPatch(translation, initial, current)).toEqual({
      fields: { description: { isManual: true, value: 'Hersiene beskrywing.' } },
      id: translation.id,
      variants: [{ fields: { name: { isManual: true, value: 'Swaar diens' } }, id: manualVariant.id }],
    });
  });

  it('re-saves an unchanged manual field after a user reviews it', () => {
    const values = toProductRangeTranslationFormValues(translation);
    const reviewedValues = { ...values, reviewedTarget: { field: 'description', kind: 'range' } as const };

    expect(toProductRangeTranslationPatch(translation, values, reviewedValues)).toEqual({
      fields: { description: { isManual: true, value: 'Gebou vir die oes.' } },
      id: translation.id,
    });
  });

  it('reads manual ownership per Range field and Variant', () => {
    expect(isProductRangeTranslationTargetManual(translation, { field: 'description', kind: 'range' })).toBe(true);
    expect(isProductRangeTranslationTargetManual(translation, { field: 'name', kind: 'range' })).toBe(false);
    expect(isProductRangeTranslationTargetManual(translation, { kind: 'variant', variantId: manualVariant.id })).toBe(
      true,
    );
    expect(isProductRangeTranslationTargetManual(translation, { kind: 'variant', variantId: aiVariant.id })).toBe(
      false,
    );
  });

  it('builds immediate enable and confirmed revert patches for Range and Variant fields', () => {
    const values = toProductRangeTranslationFormValues(translation);

    expect(
      toProductRangeTranslationTogglePatch(translation.id, values, { field: 'name', kind: 'range' }, true),
    ).toEqual({
      fields: { name: { isManual: true, value: 'Oesreeks' } },
      id: translation.id,
    });

    expect(
      toProductRangeTranslationTogglePatch(
        translation.id,
        values,
        { kind: 'variant', variantId: manualVariant.id },
        false,
      ),
    ).toEqual({
      id: translation.id,
      variants: [{ fields: { name: { isManual: false } }, id: manualVariant.id }],
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
