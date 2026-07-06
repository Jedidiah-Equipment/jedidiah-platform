import { EntityFile, Product, type ProductImages } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  type BrochureCompletenessInput,
  evaluateBrochureCompleteness,
  evaluateProductBrochureCompleteness,
} from './brochure-completeness.js';

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

// A brochure with every required field present. Each test peels one field away to assert the verdict.
function completeInput(overrides: Partial<BrochureCompletenessInput> = {}): BrochureCompletenessInput {
  return {
    assemblyCount: 1,
    category: 'Silage & Grain',
    description: 'A rugged feed mixer built for daily use.',
    images: FULL_IMAGES,
    keyFeatures: ['Heavy-duty steel construction'],
    ...overrides,
  };
}

describe('evaluateBrochureCompleteness', () => {
  it('reports complete with no missing fields when every requirement is present', () => {
    expect(evaluateBrochureCompleteness(completeInput())).toEqual({ complete: true, missingFields: [] });
  });

  it('lists every required field, in canonical order, for an empty brochure', () => {
    expect(
      evaluateBrochureCompleteness({
        assemblyCount: 0,
        category: null,
        description: null,
        images: EMPTY_IMAGES,
        keyFeatures: [],
      }),
    ).toEqual({
      complete: false,
      missingFields: ['category', 'keyFeatures', 'primary', 'technicalDrawing', 'banner', 'description', 'assemblies'],
    });
  });

  it('flags only the single field that is absent', () => {
    expect(evaluateBrochureCompleteness(completeInput({ category: null }))).toEqual({
      complete: false,
      missingFields: ['category'],
    });
    expect(evaluateBrochureCompleteness(completeInput({ keyFeatures: [] }))).toEqual({
      complete: false,
      missingFields: ['keyFeatures'],
    });
    expect(evaluateBrochureCompleteness(completeInput({ description: null }))).toEqual({
      complete: false,
      missingFields: ['description'],
    });
    expect(evaluateBrochureCompleteness(completeInput({ assemblyCount: 0 }))).toEqual({
      complete: false,
      missingFields: ['assemblies'],
    });
  });

  it('flags each empty image slot independently', () => {
    expect(
      evaluateBrochureCompleteness(completeInput({ images: { ...FULL_IMAGES, primary: null, banner: null } })),
    ).toEqual({ complete: false, missingFields: ['primary', 'banner'] });
  });

  it('treats blank text as missing', () => {
    expect(
      evaluateBrochureCompleteness(completeInput({ category: '   ', description: '\n\t', keyFeatures: ['', '  '] })),
    ).toEqual({
      complete: false,
      missingFields: ['category', 'keyFeatures', 'description'],
    });
  });

  it('counts a brochure complete when at least one key feature has text', () => {
    expect(evaluateBrochureCompleteness(completeInput({ keyFeatures: ['  ', 'Low maintenance'] }))).toEqual({
      complete: true,
      missingFields: [],
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
    requiresVinNumber: false,
    assemblies: [
      { id: '33333333-3333-4333-8333-333333333333', productId: PRODUCT_ID, kind: 'standard', name: 'Frame', parts: [] },
    ],
    productBays: [],
    category: 'Silage & Grain',
    keyFeatures: ['Heavy-duty steel construction'],
    images: FULL_IMAGES,
    thumbnailDataUrl: null,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    ...overrides,
  });
}

describe('evaluateProductBrochureCompleteness', () => {
  it('maps a complete persisted Product through to a complete verdict', () => {
    expect(evaluateProductBrochureCompleteness(completeProduct())).toEqual({ complete: true, missingFields: [] });
  });

  it('reports the missing fields drawn from the Product', () => {
    expect(evaluateProductBrochureCompleteness(completeProduct({ category: null, assemblies: [] }))).toEqual({
      complete: false,
      missingFields: ['category', 'assemblies'],
    });
  });
});
