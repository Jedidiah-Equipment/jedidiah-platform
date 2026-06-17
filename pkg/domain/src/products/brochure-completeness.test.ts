import { type BrochureImages, EntityImage } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { type BrochureCompletenessInput, evaluateBrochureCompleteness } from './brochure-completeness.js';

const IMAGE = EntityImage.parse({
  byteSize: 1_024,
  contentType: 'image/png',
  updatedAt: '2026-06-17T00:00:00.000Z',
});

const FULL_IMAGES: BrochureImages = {
  rangeLogo: IMAGE,
  hero: IMAGE,
  technicalDrawing: IMAGE,
  secondary: IMAGE,
};

const EMPTY_IMAGES: BrochureImages = {
  rangeLogo: null,
  hero: null,
  technicalDrawing: null,
  secondary: null,
};

// A brochure with every required field present. Each test peels one field away to assert the verdict.
function completeInput(overrides: Partial<BrochureCompletenessInput> = {}): BrochureCompletenessInput {
  return {
    assemblyCount: 1,
    description: 'A rugged feed mixer built for daily use.',
    images: FULL_IMAGES,
    keyFeatures: ['Heavy-duty steel construction'],
    subtitle: 'Silage & Grain',
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
        description: null,
        images: EMPTY_IMAGES,
        keyFeatures: [],
        subtitle: null,
      }),
    ).toEqual({
      complete: false,
      missingFields: [
        'subtitle',
        'keyFeatures',
        'rangeLogo',
        'hero',
        'technicalDrawing',
        'secondary',
        'description',
        'assemblies',
      ],
    });
  });

  it('flags only the single field that is absent', () => {
    expect(evaluateBrochureCompleteness(completeInput({ subtitle: null }))).toEqual({
      complete: false,
      missingFields: ['subtitle'],
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
      evaluateBrochureCompleteness(completeInput({ images: { ...FULL_IMAGES, hero: null, secondary: null } })),
    ).toEqual({ complete: false, missingFields: ['hero', 'secondary'] });
  });

  it('treats blank text as missing', () => {
    expect(
      evaluateBrochureCompleteness(completeInput({ subtitle: '   ', description: '\n\t', keyFeatures: ['', '  '] })),
    ).toEqual({
      complete: false,
      missingFields: ['subtitle', 'keyFeatures', 'description'],
    });
  });

  it('counts a brochure complete when at least one key feature has text', () => {
    expect(evaluateBrochureCompleteness(completeInput({ keyFeatures: ['  ', 'Low maintenance'] }))).toEqual({
      complete: true,
      missingFields: [],
    });
  });
});
