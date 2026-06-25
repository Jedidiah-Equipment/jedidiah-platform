import { describe, expect, it } from 'vitest';

import { mapProduct } from './product-service.js';

const RANGE_ID = '00000000-0000-4000-8000-000000000301';

describe('mapProduct', () => {
  it('maps product rows to product DTOs', () => {
    const createdAt = new Date('2026-05-13T10:00:00.000Z');
    const updatedAt = new Date('2026-05-13T11:00:00.000Z');

    expect(
      mapProduct({
        basePrice: 1234.56,
        category: 'Silage & Grain',
        images: {
          primary: {
            byteSize: 2048,
            contentType: 'image/png',
            storageKey: 'product-images/product/00000000-0000-4000-8000-000000000001/primary/abc.png',
            updatedAt: '2026-05-13T11:30:00.000Z',
          },
        },
        keyFeatures: ['Heavy duty', 'Low maintenance'],
        createdAt,
        currencyCode: 'ZAR',
        description: 'Earthmoving equipment',
        id: '00000000-0000-4000-8000-000000000001',
        buildTimeDays: 14,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        rangeId: RANGE_ID,
        requiresVinNumber: true,
        brochureEnabled: true,
        landerEnabled: false,
        thumbnailDataUrl: null,
        updatedAt,
      }),
    ).toEqual({
      assemblies: [],
      basePrice: 1234.56,
      category: 'Silage & Grain',
      images: {
        primary: { byteSize: 2048, contentType: 'image/png', updatedAt: '2026-05-13T11:30:00.000Z' },
        banner: null,
        technicalDrawing: null,
        secondary1: null,
        secondary2: null,
      },
      keyFeatures: ['Heavy duty', 'Low maintenance'],
      createdAt: createdAt.toISOString(),
      currencyCode: 'ZAR',
      description: 'Earthmoving equipment',
      id: '00000000-0000-4000-8000-000000000001',
      buildTimeDays: 14,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      productBays: [],
      rangeId: RANGE_ID,
      requiresVinNumber: true,
      brochureEnabled: true,
      landerEnabled: false,
      thumbnailDataUrl: null,
      updatedAt: updatedAt.toISOString(),
    });
  });
});
