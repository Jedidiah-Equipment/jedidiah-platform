import { describe, expect, it } from 'vitest';

import { mapProduct } from './product-service.js';

describe('mapProduct', () => {
  it('maps product rows to product DTOs', () => {
    const createdAt = new Date('2026-05-13T10:00:00.000Z');
    const updatedAt = new Date('2026-05-13T11:00:00.000Z');

    expect(
      mapProduct({
        basePrice: 1234.56,
        brochureImages: {
          hero: {
            byteSize: 2048,
            contentType: 'image/png',
            storageKey: 'brochure-images/product/00000000-0000-4000-8000-000000000001/hero/abc.png',
            updatedAt: '2026-05-13T11:30:00.000Z',
          },
        },
        brochureKeyFeatures: ['Heavy duty', 'Low maintenance'],
        brochureSubtitle: 'Silage & Grain',
        createdAt,
        currencyCode: 'ZAR',
        description: 'Earthmoving equipment',
        id: '00000000-0000-4000-8000-000000000001',
        buildTimeDays: 14,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        requiresVinNumber: true,
        thumbnailDataUrl: null,
        updatedAt,
      }),
    ).toEqual({
      assemblies: [],
      basePrice: 1234.56,
      brochureConfig: {
        images: {
          hero: { byteSize: 2048, contentType: 'image/png', updatedAt: '2026-05-13T11:30:00.000Z' },
          rangeLogo: null,
          secondary: null,
          technicalDrawing: null,
        },
        keyFeatures: ['Heavy duty', 'Low maintenance'],
        subtitle: 'Silage & Grain',
      },
      createdAt: createdAt.toISOString(),
      currencyCode: 'ZAR',
      description: 'Earthmoving equipment',
      id: '00000000-0000-4000-8000-000000000001',
      buildTimeDays: 14,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      productBays: [],
      requiresVinNumber: true,
      thumbnailDataUrl: null,
      updatedAt: updatedAt.toISOString(),
    });
  });
});
