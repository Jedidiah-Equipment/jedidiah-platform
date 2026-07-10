import { ProductListResult } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  ListProductsToolInput,
  ListProductsToolResponse,
  toCoreListProductsInput,
  toListProductsToolResponse,
} from './list-products.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const RANGE_ID = '00000000-0000-4000-8000-000000000002';

describe('listProducts v2 contract', () => {
  test('maps the narrow tool input onto the core list contract', () => {
    const input = ListProductsToolInput.parse({ search: 'loader' });

    expect(toCoreListProductsInput(input)).toEqual({
      columnFilters: {},
      page: 1,
      pageSize: 10,
      search: 'loader',
      sortBy: 'name',
      sortDirection: 'asc',
    });
  });

  test('maps core products onto the declared compact response', () => {
    const coreResult = ProductListResult.parse({
      items: [
        {
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
        },
      ],
      sortBy: 'name',
      sortDirection: 'asc',
      total: 1,
    });

    const response = toListProductsToolResponse(coreResult);

    expect(ListProductsToolResponse.parse(response)).toEqual(response);
    expect(response).toEqual({
      items: [
        expect.objectContaining({
          id: PRODUCT_ID,
          links: [{ entity: 'Product', href: `/products/${PRODUCT_ID}/edit`, label: 'Compact Loader' }],
          modelCode: 'CL-100',
          name: 'Compact Loader',
        }),
      ],
      total: 1,
    });
    expect(JSON.stringify(response)).not.toMatch(/thumbnail|images|assemblies|productBays/);
  });
});
