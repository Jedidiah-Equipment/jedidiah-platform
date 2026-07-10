import { Product } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { GetProductInput, GetProductResponse, getProductDefinition, toGetProductResponse } from './get-product.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const RANGE_ID = '00000000-0000-4000-8000-000000000002';

const product = Product.parse({
  assemblies: [],
  basePrice: 1_000,
  brochureEnabled: false,
  buildTimeDays: 14,
  category: 'Earthmoving',
  createdAt: '2026-07-10T08:00:00.000Z',
  currencyCode: 'ZAR',
  description: 'Compact articulated loader',
  id: PRODUCT_ID,
  images: {
    banner: null,
    primary: null,
    secondary1: null,
    secondary2: null,
    technicalDrawing: null,
  },
  keyFeatures: ['Tight turning circle'],
  landerEnabled: false,
  modelCode: 'CL-100',
  name: 'Compact Loader',
  nameHighlight: null,
  productBays: [],
  range: { id: RANGE_ID, name: 'Loaders' },
  rangeId: RANGE_ID,
  requiresVinNumber: false,
  technicalDetails: [{ label: 'Capacity', value: '1.2 t' }],
  thumbnailDataUrl: 'data:image/webp;base64,YQ==',
  updatedAt: '2026-07-10T09:00:00.000Z',
  variant: null,
  variantId: null,
});

describe('getProduct v2 contract', () => {
  test('requires a Product UUID', () => {
    expect(GetProductInput.parse({ id: PRODUCT_ID })).toEqual({ id: PRODUCT_ID });
    expect(() => GetProductInput.parse({ id: 'not-a-uuid' })).toThrow();
  });

  test('describes the full-detail follow-up to findProducts', () => {
    expect(getProductDefinition.name).toBe('getProduct');
    expect(getProductDefinition.description).toContain('full details');
    expect(getProductDefinition.description).toContain('findProducts');
  });

  test('maps the complete Product details without inline thumbnail data', () => {
    const response = toGetProductResponse(product);

    expect(GetProductResponse.parse(response)).toEqual(response);
    expect(response).toMatchObject({
      basePrice: 1_000,
      description: 'Compact articulated loader',
      id: PRODUCT_ID,
      keyFeatures: ['Tight turning circle'],
      links: { app: `/products/${PRODUCT_ID}/edit` },
      modelCode: 'CL-100',
      name: 'Compact Loader',
    });
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
  });
});
