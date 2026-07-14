import { describe, expect, it } from 'vitest';

import {
  catalogSourceHashes,
  catalogTranslationFieldState,
  catalogTranslationKey,
  catalogTranslationState,
  localizeFields,
  parseCatalogTranslationKey,
  translationForLocale,
} from './catalog-translation.js';

const canonicalProduct = {
  name: 'Silage Trailer',
  nameHighlight: 'XL',
  category: 'Silage & Grain',
  description: 'Built for demanding harvests.',
  keyFeatures: ['High capacity', 'Heavy-duty chassis'],
  technicalDetails: [
    { label: 'Capacity', value: '42 m³' },
    { label: 'Axles', value: '2' },
  ],
  basePrice: 1_000_000,
  images: { primary: 'ignored' },
};

describe('catalogSourceHashes', () => {
  it('hashes each canonical field independently', () => {
    const original = catalogSourceHashes(canonicalProduct);
    const editedNonTextFields = { ...canonicalProduct, basePrice: 2_000_000, images: { primary: 'replaced' } };
    const nonTextEdit = catalogSourceHashes(editedNonTextFields);
    const textEdit = catalogSourceHashes({ ...canonicalProduct, description: 'Updated brochure copy.' });

    expect(nonTextEdit.name).toBe(original.name);
    expect(nonTextEdit.description).toBe(original.description);
    expect(textEdit.name).toBe(original.name);
    expect(textEdit.description).not.toBe(original.description);
  });

  it('treats list fields as one translation field', () => {
    const original = catalogSourceHashes(canonicalProduct);
    const edited = catalogSourceHashes({
      ...canonicalProduct,
      keyFeatures: [...canonicalProduct.keyFeatures, 'Fast unloading'],
    });

    expect(edited.name).toBe(original.name);
    expect(edited.keyFeatures).not.toBe(original.keyFeatures);
  });

  it('distinguishes an empty string from null', () => {
    expect(catalogSourceHashes({ description: '' }).description).not.toBe(
      catalogSourceHashes({ description: null }).description,
    );
  });
});

describe('translation selection and staleness', () => {
  it('overlays translated fields and falls back to canonical for missing or null values', () => {
    const canonical: { description: string | null; name: string } = {
      description: 'Canonical copy.',
      name: 'Silage Trailer',
    };
    const translations = {
      af: {
        description: {
          isManual: false,
          sourceHash: 'description-hash',
          translatedAt: '2026-01-01T00:00:00Z',
          value: null,
        },
        name: {
          isManual: false,
          sourceHash: 'name-hash',
          translatedAt: '2026-01-01T00:00:00Z',
          value: 'Kuilvoer-sleepwa',
        },
      },
    };

    expect(localizeFields(canonical, translations, 'af')).toEqual({
      description: 'Canonical copy.',
      name: 'Kuilvoer-sleepwa',
    });
    expect(localizeFields(canonical, translations, 'en')).toEqual(canonical);
    expect(localizeFields(canonical, undefined, 'af')).toEqual(canonical);
  });

  it('ignores stored canonical translations and selects non-canonical translations', () => {
    const translations = {
      en: { name: 'Stored English' },
      af: { name: 'Afrikaans' },
    };

    expect(translationForLocale(translations, 'en')).toBeUndefined();
    expect(translationForLocale(translations, 'af')).toEqual({ name: 'Afrikaans' });
    expect(translationForLocale(undefined, 'af')).toBeUndefined();
  });

  it('computes fresh, missing, and stale per-field states', () => {
    expect(catalogTranslationFieldState('current', undefined)).toBe('missing');
    expect(catalogTranslationFieldState('current', { sourceHash: 'current' })).toBe('fresh');
    expect(catalogTranslationFieldState('current', { sourceHash: 'old' })).toBe('stale');
  });

  it('reports the weakest field of a translation unit as its state', () => {
    expect(catalogTranslationState(['fresh'])).toBe('fresh');
    expect(catalogTranslationState(['fresh', 'missing'])).toBe('missing');
    expect(catalogTranslationState(['fresh', 'stale'])).toBe('stale');
    expect(catalogTranslationState(['stale', 'missing'])).toBe('missing');
  });
});

describe('catalog translation keys', () => {
  it('round-trips every kind and rejects malformed keys', () => {
    expect(parseCatalogTranslationKey(catalogTranslationKey('product', 'id-1'))).toEqual({
      id: 'id-1',
      kind: 'product',
    });
    expect(parseCatalogTranslationKey(catalogTranslationKey('range', 'id-2'))).toEqual({ id: 'id-2', kind: 'range' });
    expect(parseCatalogTranslationKey(catalogTranslationKey('variant', 'id-3'))).toEqual({
      id: 'id-3',
      kind: 'variant',
    });
    expect(() => parseCatalogTranslationKey('part:id-4' as never)).toThrow('Malformed catalog translation key');
  });
});
