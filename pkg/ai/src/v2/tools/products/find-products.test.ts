import { createUserAccessSummary } from '@pkg/domain';
import { ProductListResult } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  FindProductsInput,
  FindProductsResponse,
  findProductsDefinition,
  toCoreProductListInput,
  toFindProductsResponse,
} from './find-products.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const RANGE_ID = '00000000-0000-4000-8000-000000000002';

describe('findProducts v2 contract', () => {
  test('describes the lightweight find-before-get workflow', () => {
    expect(findProductsDefinition.name).toBe('findProducts');
    expect(findProductsDefinition.description).toContain('name, model code, description, or UUID');
    expect(findProductsDefinition.description).toContain('lightweight');
    expect(findProductsDefinition.description).toContain('Call getProduct');
    expect(findProductsDefinition.description).toContain('full Product details');
    expect(findProductsDefinition.anyOfPermissions).toEqual(['product:read', 'quote:read', 'quote:create']);
  });

  test('maps its search input onto an unpaged core list read', () => {
    const input = FindProductsInput.parse({ search: 'loader' });

    expect(toCoreProductListInput(input)).toEqual({
      columnFilters: {},
      page: 1,
      pageSize: 0,
      search: 'loader',
      sortBy: 'name',
      sortDirection: 'asc',
    });
  });

  test('maps core products onto lightweight identity results', () => {
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

    const response = toFindProductsResponse(
      coreResult,
      createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }),
    );

    expect(FindProductsResponse.parse(response)).toEqual(response);
    expect(response).toEqual([
      {
        id: PRODUCT_ID,
        links: { app: `/products/${PRODUCT_ID}/edit` },
        modelCode: 'CL-100',
        name: 'Compact Loader',
      },
    ]);
    expect(JSON.stringify(response)).not.toMatch(/thumbnail|images|assemblies|productBays/);
    expect(
      toFindProductsResponse(coreResult, createUserAccessSummary({ role: 'sales', userId: 'test-user-id' })),
    ).toEqual([
      {
        id: PRODUCT_ID,
        modelCode: 'CL-100',
        name: 'Compact Loader',
      },
    ]);
  });
});
