import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  BROCHURE_KEY_FEATURE_MAX_LENGTH,
  BROCHURE_KEY_FEATURES_MAX_COUNT,
  BrochureConfigInput,
  Product,
  ProductAssembliesInput,
  ProductBaysInput,
  ProductCreateInput,
  ProductListInput,
  ProductUpdateInput,
} from './product.js';

const BAY_ID = '00000000-0000-4000-8000-000000000201';
const RANGE_ID = '00000000-0000-4000-8000-000000000301';

describe('ProductCreateInput', () => {
  it('normalizes product catalog fields', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: '1234.56',
        description: '  Earthmoving equipment  ',
        buildTimeDays: '14',
        modelCode: '  WL-100  ',
        name: '  Wheel Loader  ',
        rangeId: RANGE_ID,
      }),
    ).toEqual({
      assemblies: [],
      basePrice: 1234.56,
      brochureConfig: { keyFeatures: [], subtitle: null },
      currencyCode: 'ZAR',
      description: 'Earthmoving equipment',
      buildTimeDays: 14,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      productBays: [],
      rangeId: RANGE_ID,
      requiresVinNumber: false,
      thumbnailDataUrl: null,
    });
  });

  it('treats an empty description as null', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 0,
        description: '  ',
        buildTimeDays: 0,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
      }).description,
    ).toBeNull();
  });

  it('defaults omitted child collections to an empty catalog shell', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 120_000,
        buildTimeDays: 14,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
      }),
    ).toMatchObject({ assemblies: [], productBays: [] });
  });

  it('requires a model code and nonnegative price', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: -1,
        buildTimeDays: 1,
        modelCode: '  ',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
      }),
    ).toThrow();
  });

  it('requires nonnegative whole build time days', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: 1,
        buildTimeDays: -1,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
      }),
    ).toThrow();

    expect(() =>
      ProductCreateInput.parse({
        basePrice: 1,
        buildTimeDays: 1.5,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
      }),
    ).toThrow();
  });

  it('rejects a missing base price', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: NaN,
        buildTimeDays: 1,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
      }),
    ).toThrow();
  });

  it('requires a range', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: 1,
        buildTimeDays: 1,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });
});

describe('ProductBaysInput', () => {
  it('accepts positive whole default working days', () => {
    expect(ProductBaysInput.parse([{ bayId: BAY_ID, defaultWorkingDays: '5' }])).toEqual([
      { bayId: BAY_ID, defaultWorkingDays: 5 },
    ]);
  });

  it('rejects non-positive and decimal default working days', () => {
    expect(() => ProductBaysInput.parse([{ bayId: BAY_ID, defaultWorkingDays: 0 }])).toThrow();
    expect(() => ProductBaysInput.parse([{ bayId: BAY_ID, defaultWorkingDays: -1 }])).toThrow();
    expect(() => ProductBaysInput.parse([{ bayId: BAY_ID, defaultWorkingDays: 1.5 }])).toThrow();
  });

  it('rejects duplicate Bays', () => {
    expect(() =>
      ProductBaysInput.parse([
        { bayId: BAY_ID, defaultWorkingDays: 5 },
        { bayId: BAY_ID, defaultWorkingDays: 7 },
      ]),
    ).toThrow('Bay can only be added once per product');
  });
});

describe('ProductAssembliesInput', () => {
  it('rejects duplicate override targets', () => {
    const standardAssemblyId = '00000000-0000-4000-8000-000000000101';

    expect(() =>
      ProductAssembliesInput.parse([
        {
          id: standardAssemblyId,
          kind: 'standard',
          name: 'Standard bucket',
          parts: [],
        },
        {
          kind: 'optional',
          name: 'Rock bucket',
          overrideStandardAssemblyIds: [standardAssemblyId, standardAssemblyId],
          parts: [],
          price: 250,
        },
      ]),
    ).toThrow('Override target can only be selected once per assembly');
  });
});

describe('ProductUpdateInput', () => {
  it('preserves omitted child collections as undefined', () => {
    expect(
      ProductUpdateInput.parse({
        id: '00000000-0000-4000-8000-000000000102',
        basePrice: 1234.56,
        currencyCode: 'ZAR',
        description: '',
        buildTimeDays: '14',
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
        requiresVinNumber: true,
      }),
    ).toEqual({
      id: '00000000-0000-4000-8000-000000000102',
      basePrice: 1234.56,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      rangeId: RANGE_ID,
      requiresVinNumber: true,
      thumbnailDataUrl: null,
    });
  });
});

describe('ProductListInput', () => {
  it('accepts an optional Range filter', () => {
    expect(
      ProductListInput.parse({
        columnFilters: {
          rangeId: RANGE_ID,
        },
        pageSize: 20,
      }),
    ).toMatchObject({
      columnFilters: {
        rangeId: RANGE_ID,
      },
      pageSize: 20,
      sortBy: 'name',
      sortDirection: 'asc',
    });
  });
});

describe('Product', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Product)).not.toThrow();
  });
});

describe('BrochureConfigInput', () => {
  it('defaults to an empty config', () => {
    expect(BrochureConfigInput.parse({})).toEqual({ keyFeatures: [], subtitle: null });
  });

  it('trims the subtitle and treats blank as null', () => {
    expect(BrochureConfigInput.parse({ subtitle: '  Silage & Grain  ' }).subtitle).toBe('Silage & Grain');
    expect(BrochureConfigInput.parse({ subtitle: '   ' }).subtitle).toBeNull();
  });

  it('trims key-feature lines and rejects blank ones', () => {
    expect(BrochureConfigInput.parse({ keyFeatures: ['  Heavy duty  ', 'Low maintenance'] }).keyFeatures).toEqual([
      'Heavy duty',
      'Low maintenance',
    ]);
    expect(() => BrochureConfigInput.parse({ keyFeatures: ['   '] })).toThrow();
  });

  it('enforces the key-feature line length cap', () => {
    expect(() =>
      BrochureConfigInput.parse({ keyFeatures: ['x'.repeat(BROCHURE_KEY_FEATURE_MAX_LENGTH + 1)] }),
    ).toThrow();
  });

  it('enforces the key-feature count cap', () => {
    const tooMany = Array.from({ length: BROCHURE_KEY_FEATURES_MAX_COUNT + 1 }, (_, index) => `Feature ${index}`);

    expect(() => BrochureConfigInput.parse({ keyFeatures: tooMany })).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => BrochureConfigInput.parse({ subtitle: 'x', extra: true })).toThrow();
  });
});
