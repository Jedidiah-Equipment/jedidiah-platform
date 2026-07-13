import { describe, expect, it } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { listBays, mapJobSummary } from './job-read-service.js';

const test = createTester(() => ({}));

describe('mapJobSummary', () => {
  it('maps jobs without stage summaries', () => {
    const summary = mapJobSummary(jobRow());

    expect(summary).toMatchObject({ productBuildTimeDays: 12, productSerialNumber: 'MODEL-001260001' });
  });

  it('maps custom jobs with nullable product and serial facts', () => {
    const base = jobRow();
    const summary = mapJobSummary({
      ...base,
      product: null,
      productId: null,
      productSerialNumber: null,
      productSerialPrefix: null,
      productSerialSequence: null,
      productSerialYear: null,
      quote: {
        ...base.quote,
        kind: 'custom',
        workTitle: 'Pump skid rebuild',
      },
    });

    expect(summary).toMatchObject({
      productId: null,
      productName: null,
      productSerialNumber: null,
      quoteKind: 'custom',
      workTitle: 'Pump skid rebuild',
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

function jobRow(): Parameters<typeof mapJobSummary>[0] {
  const now = new Date('2026-05-01T00:00:00.000Z');

  return {
    code: 1,
    createdAt: now,
    id: '00000000-0000-4000-8000-000000000001',
    invoiceNumber: null,
    product: {
      buildTimeDays: 12,
      modelCode: 'MODEL-001',
      name: 'Test Product',
      thumbnailDataUrl: null,
    },
    productId: '00000000-0000-4000-8000-000000000002',
    productSerialNumber: 'MODEL-001260001',
    productSerialPrefix: 'MODEL-001',
    productSerialSequence: 1,
    productSerialYear: 26,
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
    vinNumber: null,
    description: null,
  };
}
