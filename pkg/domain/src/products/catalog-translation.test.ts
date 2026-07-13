import { describe, expect, it } from 'vitest';

import {
  isTranslationStale,
  productRangeSourceHash,
  productRangeVariantSourceHash,
  productSourceHash,
  selectTranslated,
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
  it('uses canonical text only for missing or null translated values', () => {
    expect(selectTranslated('Canonical', undefined)).toBe('Canonical');
    expect(selectTranslated('Canonical', null)).toBe('Canonical');
    expect(selectTranslated('Canonical', '')).toBe('');
  });

  it('only marks an existing translation with a different source hash stale', () => {
    expect(isTranslationStale('current', undefined)).toBe(false);
    expect(isTranslationStale('current', { sourceHash: 'current' })).toBe(false);
    expect(isTranslationStale('current', { sourceHash: 'old' })).toBe(true);
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
