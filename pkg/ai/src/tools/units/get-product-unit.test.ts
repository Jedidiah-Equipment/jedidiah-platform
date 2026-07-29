import { createUserAccessSummary } from '@pkg/domain';
import { ProductUnitDetail } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { GetProductUnitInput, getProductUnitDefinition, toGetProductUnitResponse } from './get-product-unit.js';

const UNIT_ID = '00000000-0000-4000-8000-000000000501';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000201';
const JOB_ID = '00000000-0000-4000-8000-000000000401';

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
  product: { id: PRODUCT_ID, modelCode: 'CL-120', name: 'Compact Loader' },
  productSerialNumber: '24-0117',
  vinNumber: 'VIN-24-0117',
});

describe('getProductUnit contract', () => {
  test('follows findProductUnits and reads one machine by UUID', () => {
    expect(getProductUnitDefinition.name).toBe('getProductUnit');
    expect(getProductUnitDefinition.anyOfPermissions).toEqual(['product_unit:read']);
    expect(getProductUnitDefinition.description).toContain('findProductUnits');
    expect(() => GetProductUnitInput.parse({ id: 'not-a-uuid' })).toThrow();
  });

  test('keeps the Unit detail intact and adds the links the caller can open', () => {
    const response = toGetProductUnitResponse(unit, createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }));

    expect(response).toEqual({
      ...unit,
      links: {
        app: `/units/${UNIT_ID}`,
        owner: `/customers/${CUSTOMER_ID}/edit`,
        product: `/products/${PRODUCT_ID}/edit`,
      },
    });
    expect(
      toGetProductUnitResponse(unit, createUserAccessSummary({ role: 'job-viewer', userId: 'test-user-id' })).links,
    ).toEqual({ app: `/units/${UNIT_ID}` });
  });
});
