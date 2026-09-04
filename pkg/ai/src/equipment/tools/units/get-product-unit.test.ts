import { createUserAccessSummary, roleSlotsForRole } from '@pkg/domain';
import { ProductUnitDetail } from '@pkg/schema/equipment';
import { describe, expect, test } from 'vitest';

import { GetProductUnitInput, getProductUnitDefinition, toGetProductUnitResponse } from './get-product-unit.js';

const UNIT_ID = '00000000-0000-4000-8000-000000000501';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000201';
const JOB_ID = '00000000-0000-4000-8000-000000000401';
const PRODUCT_THUMBNAIL_DATA_URL = `data:image/jpeg;base64,${'a'.repeat(16)}`;
const PRODUCT_RESPONSE = { id: PRODUCT_ID, modelCode: 'CL-120', name: 'Compact Loader' };

const unit = ProductUnitDetail.parse({
  id: UNIT_ID,
  asBuiltSpec: [{ id: '00000000-0000-4000-8000-000000000601', jobId: JOB_ID, name: 'Hydraulic quick coupler' }],
  buildState: 'on-hand',
  createdAt: '2026-07-10T08:00:00.000Z',
  jobs: [
    {
      id: JOB_ID,
      cancelledAt: null,
      code: 'JOB-00001',
      completedOn: '2026-07-20',
      createdAt: '2026-07-10T08:00:00.000Z',
    },
  ],
  owner: { id: CUSTOMER_ID, companyName: 'Acme Mining' },
  ownershipHistory: [],
  product: { ...PRODUCT_RESPONSE, thumbnailDataUrl: PRODUCT_THUMBNAIL_DATA_URL },
  productSerialNumber: '24-0117',
  vinNumber: 'VIN-24-0117',
});

describe('getProductUnit contract', () => {
  test('follows findProductUnits and reads one machine by UUID', () => {
    expect(getProductUnitDefinition.name).toBe('getProductUnit');
    expect(getProductUnitDefinition.anyOfPermissions).toEqual(['equipment_product_unit:read']);
    expect(getProductUnitDefinition.description).toContain('findProductUnits');
    expect(() => GetProductUnitInput.parse({ id: 'not-a-uuid' })).toThrow();
  });

  test('keeps the Unit detail intact and adds the links the caller can open', () => {
    const response = toGetProductUnitResponse(
      unit,
      createUserAccessSummary({ ...roleSlotsForRole('admin'), userId: 'test-user-id' }),
    );

    expect(response).toEqual({
      ...unit,
      // Everything the machine is, minus the Product thumbnail the assistant has no use for.
      product: PRODUCT_RESPONSE,
      links: {
        app: `/equipment/units/${UNIT_ID}`,
        owner: `/equipment/customers/${CUSTOMER_ID}/edit`,
        product: `/equipment/products/${PRODUCT_ID}/edit`,
      },
    });
    expect(
      toGetProductUnitResponse(
        unit,
        createUserAccessSummary({ ...roleSlotsForRole('job-viewer'), userId: 'test-user-id' }),
      ).links,
    ).toEqual({ app: `/equipment/units/${UNIT_ID}` });
  });
});
