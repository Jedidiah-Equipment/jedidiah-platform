import { EntityImage, type ProductImages } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { type BrochureCompletenessInput, evaluateBrochureCompleteness } from './brochure-completeness.js';

const IMAGE = EntityImage.parse({
  byteSize: 1_024,
  contentType: 'image/png',
  updatedAt: '2026-06-17T00:00:00.000Z',
});

const FULL_IMAGES: ProductImages = {
  primary: IMAGE,
  technicalDrawing: IMAGE,
  banner: IMAGE,
};

const EMPTY_IMAGES: ProductImages = {
  primary: null,
  technicalDrawing: null,
  banner: null,
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
