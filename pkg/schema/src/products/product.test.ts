import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { translationEnvelopeFixture } from './catalog-translation.test-fixtures.js';
import {
  LANDER_REQUIRED_FIELDS,
  PRODUCT_IMAGE_SLOT_SPECS,
  PRODUCT_KEY_FEATURE_MAX_LENGTH,
  PRODUCT_KEY_FEATURES_MAX_COUNT,
  PRODUCT_TECHNICAL_DETAIL_LABEL_MAX_LENGTH,
  PRODUCT_TECHNICAL_DETAIL_VALUE_MAX_LENGTH,
  PRODUCT_TECHNICAL_DETAILS_MAX_COUNT,
  Product,
  ProductAssembliesInput,
  ProductAssemblyTranslations,
  ProductBaysInput,
  ProductCategoryInput,
  ProductCreateInput,
  ProductKeyFeatures,
  ProductListInput,
  ProductSortBy,
  ProductTechnicalDetails,
  ProductTranslations,
  ProductUpdateInput,
} from './product.js';

describe('LANDER_REQUIRED_FIELDS', () => {
  it('contains only content rendered on the public Product page', () => {
    expect(LANDER_REQUIRED_FIELDS).toEqual([
      'category',
      'keyFeatures',
      'primary',
      'secondary1',
      'secondary2',
      'description',
      'standardAssembly',
    ]);
  });
});

const BAY_ID = '00000000-0000-4000-8000-000000000201';
const RANGE_ID = '00000000-0000-4000-8000-000000000301';
const VARIANT_ID = '00000000-0000-4000-8000-000000000302';

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
      category: null,
      currencyCode: 'ZAR',
      description: 'Earthmoving equipment',
      displayOrder: 0,
      buildTimeDays: 14,
      keyFeatures: [],
      technicalDetails: [],
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      nameHighlight: null,
      productBays: [],
      rangeId: RANGE_ID,
      variantId: null,
      requiresVinNumber: false,
      brochureEnabled: false,
      landerEnabled: false,
      thumbnailDataUrl: null,
    });
  });

  it('keeps a provided name highlight and treats blank as null', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 0,
        buildTimeDays: 0,
        modelCode: 'WL-100',
        name: 'Wheel Loader 4000',
        nameHighlight: '  4000  ',
        rangeId: RANGE_ID,
      }).nameHighlight,
    ).toBe('4000');

    expect(
      ProductCreateInput.parse({
        basePrice: 0,
        buildTimeDays: 0,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        nameHighlight: '   ',
        rangeId: RANGE_ID,
      }).nameHighlight,
    ).toBeNull();
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

  it('accepts an optional Range Variant reference', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 120_000,
        buildTimeDays: 14,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
        variantId: VARIANT_ID,
      }).variantId,
    ).toBe(VARIANT_ID);
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
  it('accepts negative optional assembly prices as product price adjustments', () => {
    expect(
      ProductAssembliesInput.parse([
        {
          kind: 'optional',
          name: 'Manual controls credit',
          overrideStandardAssemblyIds: [],
          parts: [],
          price: '-250',
        },
      ]),
    ).toEqual([
      {
        kind: 'optional',
        name: 'Manual controls credit',
        overrideStandardAssemblyIds: [],
        parts: [],
        price: -250,
      },
    ]);
  });

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
  it('accepts a manually assigned display order', () => {
    expect(
      ProductUpdateInput.parse({
        id: '00000000-0000-4000-8000-000000000102',
        basePrice: 1234.56,
        currencyCode: 'ZAR',
        description: '',
        displayOrder: 20,
        buildTimeDays: '14',
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
        requiresVinNumber: true,
        brochureEnabled: false,
        landerEnabled: false,
      }).displayOrder,
    ).toBe(20);
  });

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
        brochureEnabled: false,
        landerEnabled: false,
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
      brochureEnabled: false,
      landerEnabled: false,
      thumbnailDataUrl: null,
    });
  });

  it('omits an absent name highlight so the stored value is preserved', () => {
    const parsed = ProductUpdateInput.parse({
      id: '00000000-0000-4000-8000-000000000102',
      basePrice: 1234.56,
      currencyCode: 'ZAR',
      description: '',
      buildTimeDays: '14',
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      rangeId: RANGE_ID,
      requiresVinNumber: true,
      brochureEnabled: false,
      landerEnabled: false,
    });
    expect('nameHighlight' in parsed).toBe(false);

    expect(
      ProductUpdateInput.parse({
        id: '00000000-0000-4000-8000-000000000102',
        basePrice: 1234.56,
        currencyCode: 'ZAR',
        description: '',
        buildTimeDays: '14',
        modelCode: 'WL-100',
        name: 'Wheel Loader 4000',
        nameHighlight: '  4000  ',
        rangeId: RANGE_ID,
        requiresVinNumber: true,
        brochureEnabled: false,
        landerEnabled: false,
      }).nameHighlight,
    ).toBe('4000');
  });
});

describe('ProductListInput', () => {
  it('accepts display-order sorting', () => {
    expect(ProductSortBy.parse('displayOrder')).toBe('displayOrder');
  });

  it('accepts updated-at sorting', () => {
    expect(ProductSortBy.parse('updatedAt')).toBe('updatedAt');
    expect(ProductListInput.parse({ sortBy: 'updatedAt', sortDirection: 'desc' })).toMatchObject({
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
  });

  it('accepts optional Range and Variant filters', () => {
    expect(
      ProductListInput.parse({
        columnFilters: {
          rangeId: RANGE_ID,
          variantId: '00000000-0000-4000-8000-000000000103',
        },
        pageSize: 20,
        sortBy: 'variantName',
      }),
    ).toMatchObject({
      columnFilters: {
        rangeId: RANGE_ID,
        variantId: '00000000-0000-4000-8000-000000000103',
      },
      pageSize: 20,
      sortBy: 'variantName',
      sortDirection: 'asc',
    });
  });
});

describe('Product', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Product)).not.toThrow();
  });
});

describe('catalog translation blobs', () => {
  it('validates partial locale-keyed Product and Assembly field envelopes', () => {
    expect(
      ProductTranslations.parse({
        af: {
          name: translationEnvelopeFixture('Kuilvoerwa'),
          description: translationEnvelopeFixture(null),
          keyFeatures: translationEnvelopeFixture(['Swaardiens-onderstel']),
        },
      }),
    ).toMatchObject({ af: { name: { value: 'Kuilvoerwa' }, description: { value: null } } });
    expect(
      ProductAssemblyTranslations.parse({ af: { name: translationEnvelopeFixture('Hidrouliese agterklap') } }),
    ).toMatchObject({ af: { name: { isManual: false, value: 'Hidrouliese agterklap' } } });
    expect(() =>
      ProductAssemblyTranslations.parse({
        af: {
          name: { ...translationEnvelopeFixture('Hidrouliese agterklap'), translatedAt: '2026-07-13' },
        },
      }),
    ).toThrow();
  });
});

describe('ProductCategoryInput', () => {
  it('defaults a missing category to null', () => {
    expect(ProductCategoryInput.parse(undefined)).toBeNull();
  });

  it('trims the category and treats blank as null', () => {
    expect(ProductCategoryInput.parse('  Silage & Grain  ')).toBe('Silage & Grain');
    expect(ProductCategoryInput.parse('   ')).toBeNull();
  });
});

describe('ProductKeyFeatures', () => {
  it('trims key-feature lines and rejects blank ones', () => {
    expect(ProductKeyFeatures.parse(['  Heavy duty  ', 'Low maintenance'])).toEqual(['Heavy duty', 'Low maintenance']);
    expect(() => ProductKeyFeatures.parse(['   '])).toThrow();
  });

  it('enforces the key-feature line length cap', () => {
    expect(() => ProductKeyFeatures.parse(['x'.repeat(PRODUCT_KEY_FEATURE_MAX_LENGTH + 1)])).toThrow();
  });

  it('enforces the key-feature count cap', () => {
    const tooMany = Array.from({ length: PRODUCT_KEY_FEATURES_MAX_COUNT + 1 }, (_, index) => `Feature ${index}`);

    expect(() => ProductKeyFeatures.parse(tooMany)).toThrow();
  });
});

describe('ProductTechnicalDetails', () => {
  it('trims label/value pairs and rejects blank halves', () => {
    expect(ProductTechnicalDetails.parse([{ label: '  Working Width  ', value: '  7 m  ' }])).toEqual([
      { label: 'Working Width', value: '7 m' },
    ]);
    expect(() => ProductTechnicalDetails.parse([{ label: '   ', value: '7 m' }])).toThrow();
    expect(() => ProductTechnicalDetails.parse([{ label: 'Working Width', value: '   ' }])).toThrow();
  });

  it('enforces the label and value length caps', () => {
    expect(() =>
      ProductTechnicalDetails.parse([
        { label: 'x'.repeat(PRODUCT_TECHNICAL_DETAIL_LABEL_MAX_LENGTH + 1), value: '7 m' },
      ]),
    ).toThrow();
    expect(() =>
      ProductTechnicalDetails.parse([
        { label: 'Working Width', value: 'x'.repeat(PRODUCT_TECHNICAL_DETAIL_VALUE_MAX_LENGTH + 1) },
      ]),
    ).toThrow();
  });

  it('caps the number of technical details', () => {
    const tooMany = Array.from({ length: PRODUCT_TECHNICAL_DETAILS_MAX_COUNT + 1 }, (_, index) => ({
      label: `Spec ${index}`,
      value: `${index}`,
    }));

    expect(() => ProductTechnicalDetails.parse(tooMany)).toThrow();
  });
});

describe('ProductCreateInput marketing fields', () => {
  it('flattens category and key features to the top level', () => {
    const parsed = ProductCreateInput.parse({
      basePrice: 1,
      buildTimeDays: 1,
      category: '  Silage & Grain  ',
      keyFeatures: ['  Heavy duty  '],
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      rangeId: RANGE_ID,
    });

    expect(parsed.category).toBe('Silage & Grain');
    expect(parsed.keyFeatures).toEqual(['Heavy duty']);
  });
});

describe('PRODUCT_IMAGE_SLOT_SPECS', () => {
  it('keeps technical drawings uncropped for editor preview and PDF output', () => {
    expect(PRODUCT_IMAGE_SLOT_SPECS.technicalDrawing.fit).toBe('contain');
  });
});
