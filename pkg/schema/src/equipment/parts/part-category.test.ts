import { describe, expect, it } from 'vitest';

import { PartCategoryCreateInput, partCategoryLookupKey } from './part-category.js';

describe('PartCategoryCreateInput', () => {
  it('stores a name with its whitespace runs collapsed, so casing alone decides uniqueness', () => {
    expect(PartCategoryCreateInput.parse({ name: '  Bolt \t &   Nuts ' })).toEqual({ name: 'Bolt & Nuts' });
    expect(PartCategoryCreateInput.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('partCategoryLookupKey', () => {
  it('folds casing and whitespace runs, and nothing else', () => {
    expect(partCategoryLookupKey('  Bolt \t &   NUTS ')).toBe('bolt & nuts');
    expect(partCategoryLookupKey(PartCategoryCreateInput.parse({ name: ' bolt &\nnuts' }).name)).toBe('bolt & nuts');
    expect(partCategoryLookupKey('Bolt & Nuts')).toBe('bolt & nuts');
  });
});
