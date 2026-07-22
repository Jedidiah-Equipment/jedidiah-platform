import { EntityFile, Product, type ProductImages } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { isBrochureReady } from './brochure-completeness.js';
import {
  evaluateLanderCompleteness,
  evaluateProductLanderCompleteness,
  isLanderReady,
  type LanderCompletenessInput,
} from './lander-completeness.js';

const IMAGE = EntityFile.parse({
  byteSize: 1_024,
  contentType: 'image/png',
  updatedAt: '2026-06-17T00:00:00.000Z',
});

const FULL_IMAGES: ProductImages = {
  primary: IMAGE,
  technicalDrawing: IMAGE,
  banner: IMAGE,
  secondary1: IMAGE,
  secondary2: IMAGE,
};

const EMPTY_IMAGES: ProductImages = {
  primary: null,
  technicalDrawing: null,
  banner: null,
  secondary1: null,
  secondary2: null,
};

// A lander with every required field present. Each test peels one field away to assert the verdict.
function completeInput(overrides: Partial<LanderCompletenessInput> = {}): LanderCompletenessInput {
  return {
    category: 'Silage & Grain',
    description: 'A rugged feed mixer built for daily use.',
    images: FULL_IMAGES,
    keyFeatures: ['Heavy-duty steel construction'],
    standardAssemblyCount: 1,
    ...overrides,
  };
}

describe('evaluateLanderCompleteness', () => {
  it('reports complete with no missing fields when every requirement is present', () => {
    expect(evaluateLanderCompleteness(completeInput())).toEqual({ complete: true, missingFields: [] });
  });

  it('lists every required field, in canonical order, for an empty lander', () => {
    expect(
      evaluateLanderCompleteness({
        category: null,
        description: null,
        images: EMPTY_IMAGES,
        keyFeatures: [],
        standardAssemblyCount: 0,
      }),
    ).toEqual({
      complete: false,
      missingFields: [
        'category',
        'keyFeatures',
        'primary',
        'secondary1',
        'secondary2',
        'description',
        'standardAssembly',
      ],
    });
  });

  it('requires the lander gallery slots, not the brochure-only slots', () => {
    // technicalDrawing + banner empty but the gallery slots present -> still complete.
    expect(
      evaluateLanderCompleteness(completeInput({ images: { ...FULL_IMAGES, technicalDrawing: null, banner: null } })),
    ).toEqual({ complete: true, missingFields: [] });

    // A missing gallery slot is flagged.
    expect(evaluateLanderCompleteness(completeInput({ images: { ...FULL_IMAGES, secondary2: null } }))).toEqual({
      complete: false,
      missingFields: ['secondary2'],
    });
  });

  it('requires at least one standard assembly', () => {
    expect(evaluateLanderCompleteness(completeInput({ standardAssemblyCount: 0 }))).toEqual({
      complete: false,
      missingFields: ['standardAssembly'],
    });
  });

  it('treats blank text as missing', () => {
    expect(
      evaluateLanderCompleteness(completeInput({ category: '   ', description: '\n\t', keyFeatures: ['', '  '] })),
    ).toEqual({
      complete: false,
      missingFields: ['category', 'keyFeatures', 'description'],
    });
  });
});

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

function completeProduct(overrides: Partial<Product> = {}): Product {
  return Product.parse({
    id: PRODUCT_ID,
    name: 'Feed Mixer',
    description: 'A rugged feed mixer built for daily use.',
    modelCode: 'FM-100',
    basePrice: 1000,
    buildTimeDays: 5,
    currencyCode: 'ZAR',
    range: { id: '22222222-2222-4222-8222-222222222222', name: 'Feed Mixers' },
    rangeId: '22222222-2222-4222-8222-222222222222',
    variant: null,
    variantId: null,
    requiresVinNumber: false,
    brochureEnabled: true,
    landerEnabled: true,
    assemblies: [
      { id: '33333333-3333-4333-8333-333333333333', productId: PRODUCT_ID, kind: 'standard', name: 'Frame', parts: [] },
    ],
    productBays: [],
    category: 'Silage & Grain',
    keyFeatures: ['Heavy-duty steel construction'],
    technicalDetails: [{ label: 'Working Width', value: '7 m' }],
    images: FULL_IMAGES,
    thumbnailDataUrl: null,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    ...overrides,
  });
}

describe('evaluateProductLanderCompleteness', () => {
  it('maps a complete persisted Product through to a complete verdict', () => {
    expect(evaluateProductLanderCompleteness(completeProduct())).toEqual({ complete: true, missingFields: [] });
  });

  it('counts only standard assemblies toward the assembly requirement', () => {
    const optionalOnly = completeProduct({
      assemblies: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          productId: PRODUCT_ID,
          kind: 'optional',
          name: 'Add-on',
          price: 100,
          parts: [],
          overrideStandardAssemblyIds: [],
        },
      ],
    });

    expect(evaluateProductLanderCompleteness(optionalOnly)).toEqual({
      complete: false,
      missingFields: ['standardAssembly'],
    });
  });
});

describe('isLanderReady / isBrochureReady', () => {
  it('requires both the enabled flag and completeness', () => {
    expect(isLanderReady(completeProduct())).toBe(true);
    expect(isLanderReady(completeProduct({ landerEnabled: false }))).toBe(false);
    expect(isLanderReady(completeProduct({ category: null }))).toBe(false);
    expect(isLanderReady(completeProduct({ technicalDetails: [] }))).toBe(true);

    expect(isBrochureReady(completeProduct())).toBe(true);
    expect(isBrochureReady(completeProduct({ brochureEnabled: false }))).toBe(false);
    // Brochure needs technicalDrawing + banner; an empty brochure slot blocks readiness even when enabled.
    expect(isBrochureReady(completeProduct({ images: { ...FULL_IMAGES, banner: null } }))).toBe(false);
  });
});
