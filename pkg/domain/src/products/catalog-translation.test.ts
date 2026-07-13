import { describe, expect, it } from 'vitest';

import {
  catalogTranslationKey,
  catalogTranslationState,
  isTranslationStale,
  localizeFields,
  parseCatalogTranslationKey,
  productRangeSourceHash,
  productRangeVariantSourceHash,
  productSourceHash,
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

const assemblies = [
  { id: 'assembly-b', name: 'Hydraulic tailgate' },
  { id: 'assembly-a', name: 'Standard drawbar' },
] as const;

describe('productSourceHash', () => {
  it('hashes only canonical translatable text', () => {
    const original = productSourceHash(canonicalProduct, assemblies);
    const editedNonTextFields = { ...canonicalProduct, basePrice: 2_000_000, images: { primary: 'replaced' } };
    const nonTextEdit = productSourceHash(editedNonTextFields, assemblies);
    const textEdit = productSourceHash({ ...canonicalProduct, description: 'Updated brochure copy.' }, assemblies);

    expect(nonTextEdit).toBe(original);
    expect(textEdit).not.toBe(original);
  });

  it('includes assembly names without depending on assembly order', () => {
    const original = productSourceHash(canonicalProduct, assemblies);

    expect(productSourceHash(canonicalProduct, assemblies.toReversed())).toBe(original);
    expect(
      productSourceHash(canonicalProduct, [
        { ...assemblies[0], id: 'replacement-b' },
        { ...assemblies[1], id: 'replacement-a' },
      ]),
    ).toBe(original);
    expect(
      productSourceHash(canonicalProduct, [{ ...assemblies[0], name: 'Updated tailgate' }, assemblies[1]]),
    ).not.toBe(original);
  });

  it('distinguishes an empty string from null', () => {
    expect(productSourceHash({ ...canonicalProduct, description: '' }, assemblies)).not.toBe(
      productSourceHash({ ...canonicalProduct, description: null }, assemblies),
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
      af: { description: null, name: 'Kuilvoer-sleepwa', sourceHash: 'hash', translatedAt: '2026-01-01T00:00:00Z' },
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

  it('only marks an existing translation with a different source hash stale', () => {
    expect(isTranslationStale('current', undefined)).toBe(false);
    expect(isTranslationStale('current', { sourceHash: 'current' })).toBe(false);
    expect(isTranslationStale('current', { sourceHash: 'old' })).toBe(true);
  });

  it('reports the weakest member of a translation unit as its state', () => {
    expect(catalogTranslationState('current', [{ sourceHash: 'current' }])).toBe('fresh');
    expect(catalogTranslationState('current', [{ sourceHash: 'current' }, undefined])).toBe('missing');
    expect(catalogTranslationState('current', [{ sourceHash: 'current' }, { sourceHash: 'old' }])).toBe('stale');
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

describe('range and variant source hashes', () => {
  it('changes a Range hash only when its Canonical Text changes', () => {
    const original = productRangeSourceHash({ name: 'Silage Trailers', description: 'Built for harvest.' });

    expect(productRangeSourceHash({ name: 'Silage Trailers', description: 'Built for harvest.' })).toBe(original);
    expect(productRangeSourceHash({ name: 'Silage Trailers', description: 'Updated copy.' })).not.toBe(original);
  });

  it('hashes a Variant name', () => {
    expect(productRangeVariantSourceHash({ name: 'Heavy Duty' })).toBe(
      productRangeVariantSourceHash({ name: 'Heavy Duty' }),
    );
    expect(productRangeVariantSourceHash({ name: 'Heavy Duty' })).not.toBe(
      productRangeVariantSourceHash({ name: 'Compact' }),
    );
  });
});
