import type { CatalogProductTranslation } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  getProductTranslationManualFields,
  toProductTranslationFormValues,
  toProductTranslationPatch,
  toProductTranslationTogglePatch,
} from './types.js';

const productTranslation = {
  assemblies: [
    {
      fields: {
        name: {
          canonical: 'Hydraulic tailgate',
          state: 'fresh',
          translation: envelope('Hidrouliese agterklap', true),
        },
      },
      id: '123e4567-e89b-42d3-a456-426614174001',
    },
  ],
  fields: {
    category: {
      canonical: 'Silage',
      state: 'fresh',
      translation: envelope('Kuilvoer', false),
    },
    description: {
      canonical: 'Built for harvest.',
      state: 'needsReview',
      translation: envelope('Gebou vir die oes.', true),
    },
    keyFeatures: {
      canonical: ['High capacity', 'New English feature'],
      state: 'needsReview',
      translation: envelope(['Hoe kapasiteit'], true),
    },
    name: {
      canonical: 'Silage Trailer',
      state: 'fresh',
      translation: envelope('Kuilvoersleepwa', false),
    },
    nameHighlight: {
      canonical: null,
      state: 'missing',
    },
    technicalDetails: {
      canonical: [
        { label: 'Capacity', value: '42 m3' },
        { label: 'Axles', value: '2' },
      ],
      state: 'needsReview',
      translation: envelope([{ label: 'Kapasiteit', value: '42 m3' }], true),
    },
  },
  id: '123e4567-e89b-42d3-a456-426614174000',
} satisfies CatalogProductTranslation;

describe('Product translation form mapping', () => {
  it('mirrors English list structure and leaves new Afrikaans items empty', () => {
    const values = toProductTranslationFormValues(productTranslation);

    expect(values.fields.keyFeatures).toEqual(['Hoe kapasiteit', '']);
    expect(values.fields.technicalDetails).toEqual([
      { label: 'Kapasiteit', value: '42 m3' },
      { label: '', value: '' },
    ]);
  });

  it('patches only changed manual fields during autosave', () => {
    const initial = toProductTranslationFormValues(productTranslation);
    const current = structuredClone(initial);
    current.fields.description = 'Hersiene beskrywing.';
    current.fields.category = 'Kategorie that must remain AI managed';

    expect(toProductTranslationPatch(productTranslation, initial, current)).toEqual({
      fields: { description: { isManual: true, value: 'Hersiene beskrywing.' } },
      id: productTranslation.id,
    });
  });

  it('re-saves only the reviewed manual field when its value is unchanged', () => {
    const values = toProductTranslationFormValues(productTranslation);
    const reviewedValues = {
      ...values,
      reviewedTarget: { field: 'description', kind: 'product' } as const,
    };

    expect(toProductTranslationPatch(productTranslation, values, reviewedValues)).toEqual({
      fields: { description: { isManual: true, value: 'Gebou vir die oes.' } },
      id: productTranslation.id,
    });
  });

  it('builds immediate enable and confirmed revert patches for Product and Assembly fields', () => {
    const values = toProductTranslationFormValues(productTranslation);
    const assembly = productTranslation.assemblies[0];
    if (!assembly) throw new Error('Assembly fixture missing');

    expect(getProductTranslationManualFields(productTranslation).fields.description).toBe(true);
    expect(
      toProductTranslationTogglePatch(
        productTranslation.id,
        values,
        {
          field: 'name',
          kind: 'product',
        },
        true,
      ),
    ).toEqual({
      fields: { name: { isManual: true, value: 'Kuilvoersleepwa' } },
      id: productTranslation.id,
    });
    expect(
      toProductTranslationTogglePatch(
        productTranslation.id,
        values,
        {
          assemblyId: assembly.id,
          kind: 'assembly',
        },
        false,
      ),
    ).toEqual({
      assemblies: [
        {
          fields: { name: { isManual: false } },
          id: assembly.id,
        },
      ],
      id: productTranslation.id,
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
