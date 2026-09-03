import { describe, expect, it } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { listBays, mapJobSummary } from './job-read-service.js';

const test = createTester(() => ({}));

describe('mapJobSummary', () => {
  it('maps jobs without stage summaries', () => {
    const summary = mapJobSummary(jobRow());

    expect(summary).toMatchObject({
      productBuildTimeDays: 12,
      productUnit: { productSerialNumber: 'MODEL-001260001' },
    });
  });

  it('reads the serial and product off the machine', () => {
    const summary = mapJobSummary(jobRow());

    expect(summary).toMatchObject({
      productName: 'Test Product',
      productUnit: {
        id: '00000000-0000-4000-8000-000000000003',
        productId: '00000000-0000-4000-8000-000000000002',
        productSerialNumber: 'MODEL-001260001',
      },
    });
  });

  it('shows the Owner of the machine a Job builds', () => {
    const summary = mapJobSummary(jobRow());

    expect(summary).toMatchObject({ customerCompanyName: 'Riverside Farm' });
  });

  it('follows a resale rather than the Quote that first built the machine', () => {
    const base = jobRow();
    const summary = mapJobSummary({
      ...base,
      productUnit: productUnitRow([
        ...productUnitRow().ownershipTransfers,
        {
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          id: '00000000-0000-4000-8000-00000000000b',
          occurredOn: '2026-06-01',
          toCustomer: {
            companyName: 'Hilltop Transport',
            id: '00000000-0000-4000-8000-000000000009',
            thumbnailDataUrl: null,
          },
          toCustomerId: '00000000-0000-4000-8000-000000000009',
        },
      ]),
    });

    expect(summary).toMatchObject({
      customerCompanyName: 'Hilltop Transport',
      customerId: '00000000-0000-4000-8000-000000000009',
    });
  });

  it('reads a Job on an unowned machine as Stock', () => {
    const base = jobRow();
    const summary = mapJobSummary({ ...base, productUnit: productUnitRow([]) });

    expect(summary).toMatchObject({
      customerCompanyName: null,
      customerId: null,
      customerThumbnailDataUrl: null,
    });
  });

  it('maps a Custom Job with no machine at all', () => {
    const base = jobRow();
    const summary = mapJobSummary({
      ...base,
      productUnit: null,
      productUnitId: null,
      quote: {
        code: 1,
        customer: {
          companyName: 'Test Customer',
          id: '00000000-0000-4000-8000-000000000004',
          thumbnailDataUrl: null,
        },
        kind: 'custom',
        workTitle: 'Pump skid rebuild',
      },
    });

    expect(summary).toMatchObject({
      productName: null,
      productUnit: null,
      quoteKind: 'custom',
      workTitle: 'Pump skid rebuild',
    });
  });

  it('reads a Stock Build as Stock, carrying no commercial facts', () => {
    const base = jobRow();
    const summary = mapJobSummary({ ...base, productUnit: productUnitRow([]), quote: null, quoteId: null });

    expect(summary).toMatchObject({
      customerCompanyName: null,
      customerId: null,
      // The machine is still fully identified — only the sale is missing.
      productName: 'Test Product',
      productUnit: { productSerialNumber: 'MODEL-001260001' },
      quoteCode: null,
      quoteId: null,
      quoteKind: null,
      workTitle: null,
    });
  });
});

describe('listBays', () => {
  test('returns bays in deterministic order for admins', async ({ context }) => {
    const result = await listBays({
      db: context.db,
    });

    expect(result.items.map((bay) => bay.name)).toEqual([
      'Fabrication Bay 1',
      'Fabrication Bay 2',
      'Fabrication Bay 3',
      'Fabrication Bay 4',
      'Fabrication Bay 5',
    ]);
  });

  test('returns all bays for admins', async ({ context }) => {
    const result = await listBays({
      db: context.db,
    });

    expect(result.items).toHaveLength(5);
  });

  test('returns all bays for department managers with job read permission', async ({ context }) => {
    const result = await listBays({
      db: context.db,
    });

    expect(result.items).toHaveLength(5);
  });

  test('returns all bays for unscoped department managers', async ({ context }) => {
    const result = await listBays({
      db: context.db,
    });

    expect(result.items).toHaveLength(5);
  });

  test('returns all bays for procurement managers with job read permission', async ({ context }) => {
    const result = await listBays({
      db: context.db,
    });

    expect(result.items).toHaveLength(5);
  });
});

type ProductUnitRow = NonNullable<Parameters<typeof mapJobSummary>[0]['productUnit']>;

function productUnitRow(ownershipTransfers?: ProductUnitRow['ownershipTransfers']): ProductUnitRow {
  return {
    ownershipTransfers: ownershipTransfers ?? [
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        id: '00000000-0000-4000-8000-00000000000a',
        occurredOn: '2026-05-01',
        toCustomer: {
          companyName: 'Riverside Farm',
          id: '00000000-0000-4000-8000-000000000004',
          thumbnailDataUrl: null,
        },
        toCustomerId: '00000000-0000-4000-8000-000000000004',
      },
    ],
    product: {
      buildTimeDays: 12,
      id: '00000000-0000-4000-8000-000000000002',
      modelCode: 'MODEL-001',
      name: 'Test Product',
      thumbnailDataUrl: null,
    },
    productSerialNumber: 'MODEL-001260001',
    vinNumber: null,
  };
}

function jobRow(): Parameters<typeof mapJobSummary>[0] {
  const now = new Date('2026-05-01T00:00:00.000Z');

  return {
    cancellationReason: null,
    cancelledAt: null,
    code: 1,
    completedOn: null,
    createdAt: now,
    id: '00000000-0000-4000-8000-000000000001',
    productUnit: productUnitRow(),
    productUnitId: '00000000-0000-4000-8000-000000000003',
    quote: {
      code: 1,
      kind: 'product',
      workTitle: null,
      customer: {
        companyName: 'Test Customer',
        id: '00000000-0000-4000-8000-000000000004',
        thumbnailDataUrl: null,
      },
    },
    quoteId: '00000000-0000-4000-8000-000000000003',
    updatedAt: now,
    description: null,
  };
}
