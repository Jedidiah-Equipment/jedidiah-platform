import { describe, expect, it } from 'vitest';

import { PartCategoryCreateInput } from './part-category.js';

describe('PartCategoryCreateInput', () => {
  it('stores a name with its whitespace runs collapsed, so casing alone decides uniqueness', () => {
    expect(PartCategoryCreateInput.parse({ name: '  Bolt \t &   Nuts ' })).toEqual({ name: 'Bolt & Nuts' });
    expect(PartCategoryCreateInput.safeParse({ name: '   ' }).success).toBe(false);
  });
});
