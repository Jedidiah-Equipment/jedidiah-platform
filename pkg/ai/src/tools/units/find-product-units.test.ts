import { createUserAccessSummary } from '@pkg/domain';
import type { ProductUnitListResult } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  FindProductUnitsInput,
  FindProductUnitsResponse,
  findProductUnitsDefinition,
  toCoreProductUnitListInput,
  toFindProductUnitsResponse,
} from './find-product-units.js';

const UNIT_ID = '00000000-0000-4000-8000-000000000501';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000201';
const PRODUCT_THUMBNAIL_DATA_URL = `data:image/jpeg;base64,${'a'.repeat(16)}`;

function createListResult(owner: { id: string; companyName: string } | null): ProductUnitListResult {
  return {
    items: [
      {
        id: UNIT_ID,
        buildState: 'on-hand',
        createdAt: '2026-07-10T08:00:00.000Z',
        owner,
        product: {
          id: PRODUCT_ID,
          modelCode: 'CL-120',
          name: 'Compact Loader',
          thumbnailDataUrl: PRODUCT_THUMBNAIL_DATA_URL,
        },
        productSerialNumber: '24-0117',
        vinNumber: 'VIN-24-0117',
      },
    ],
  } as ProductUnitListResult;
}

describe('findProductUnits contract', () => {
  test('describes the find-before-get workflow and its stock selector', () => {
    expect(findProductUnitsDefinition.name).toBe('findProductUnits');
    expect(findProductUnitsDefinition.anyOfPermissions).toEqual(['equipment_product_unit:read']);
    expect(findProductUnitsDefinition.description).toContain('stock');
    expect(findProductUnitsDefinition.description).toContain('getProductUnit');
  });

  test('maps the serial search and filters onto an unpaged Unit read', () => {
    const input = FindProductUnitsInput.parse({ columnFilters: { owner: 'stock' }, search: '24-0117' });

    expect(toCoreProductUnitListInput(input)).toEqual({
      columnFilters: { owner: 'stock' },
      cursor: 0,
      limit: 0,
      search: '24-0117',
      sortBy: 'productSerialNumber',
      sortDirection: 'asc',
    });
  });

  test('links an owned Unit to its Owner and Product', () => {
    const result = createListResult({ companyName: 'Acme Mining', id: CUSTOMER_ID });

    const response = toFindProductUnitsResponse(
      result,
      createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }),
    );

    expect(FindProductUnitsResponse.parse(response)).toEqual(response);
    expect(response[0]?.links).toEqual({
      app: `/equipment/units/${UNIT_ID}`,
      owner: `/equipment/customers/${CUSTOMER_ID}/edit`,
      product: `/equipment/products/${PRODUCT_ID}/edit`,
    });
  });

  test('leaves the Product thumbnail out of the payload', () => {
    const response = toFindProductUnitsResponse(
      createListResult({ companyName: 'Acme Mining', id: CUSTOMER_ID }),
      createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }),
    );

    expect(response[0]?.product).toEqual({ id: PRODUCT_ID, modelCode: 'CL-120', name: 'Compact Loader' });
  });

  test('omits links the caller cannot open, and the Owner link for a Unit in Stock', () => {
    const stockUnit = toFindProductUnitsResponse(
      createListResult(null),
      createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }),
    );
    expect(stockUnit[0]?.links).toEqual({
      app: `/equipment/units/${UNIT_ID}`,
      product: `/equipment/products/${PRODUCT_ID}/edit`,
    });

    const jobViewer = toFindProductUnitsResponse(
      createListResult({ companyName: 'Acme Mining', id: CUSTOMER_ID }),
      createUserAccessSummary({ role: 'job-viewer', userId: 'test-user-id' }),
    );
    expect(jobViewer[0]?.links).toEqual({ app: `/equipment/units/${UNIT_ID}` });
  });
});
