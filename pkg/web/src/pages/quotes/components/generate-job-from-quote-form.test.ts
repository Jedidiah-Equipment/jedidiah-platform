import { Bay, ProductBay } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getBaySeedBayMap, toJobCreateFormValues, toJobCreateInput } from './generate-job-from-quote-form.js';

const QUOTE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ENABLED_BAY_ID = '550e8400-e29b-41d4-a716-446655440002';
const DISABLED_BAY_ID = '550e8400-e29b-41d4-a716-446655440003';

describe('toJobCreateFormValues', () => {
  it('prefills from enabled Product Bays using default working-days', () => {
    expect(
      toJobCreateFormValues({
        productBays: [
          buildProductBay({ bayId: ENABLED_BAY_ID, defaultWorkingDays: 4, name: 'Fabrication Bay' }),
          buildProductBay({ bayId: DISABLED_BAY_ID, defaultWorkingDays: 6, disabledAt: null, name: 'Paint Bay' }),
        ],
      }),
    ).toEqual({
      baySeeds: [
        { bayId: ENABLED_BAY_ID, durationDays: 4 },
        { bayId: DISABLED_BAY_ID, durationDays: 6 },
      ],
    });
  });

  it('skips disabled Product Bays', () => {
    expect(
      toJobCreateFormValues({
        productBays: [
          buildProductBay({ bayId: ENABLED_BAY_ID, defaultWorkingDays: 4, name: 'Fabrication Bay' }),
          buildProductBay({
            bayId: DISABLED_BAY_ID,
            defaultWorkingDays: 6,
            disabledAt: '2026-06-01T00:00:00.000Z',
            name: 'Retired Bay',
          }),
        ],
      }).baySeeds,
    ).toEqual([{ bayId: ENABLED_BAY_ID, durationDays: 4 }]);
  });

  it('starts empty when the Product has no Product Bays', () => {
    expect(toJobCreateFormValues({ productBays: [] })).toEqual({ baySeeds: [] });
  });
});

describe('toJobCreateInput', () => {
  it('maps edited and removed rows into the create Job baySeeds payload', () => {
    expect(
      toJobCreateInput({
        quoteId: QUOTE_ID,
        value: {
          baySeeds: [{ bayId: ENABLED_BAY_ID, durationDays: 7 }],
        },
      }),
    ).toEqual({
      baySeeds: [{ bayId: ENABLED_BAY_ID, durationDays: 7 }],
      quoteId: QUOTE_ID,
    });
  });
});

describe('getBaySeedBayMap', () => {
  it('uses Product Bay metadata before the enabled Bay picker finishes loading', () => {
    const productBay = buildProductBay({ bayId: ENABLED_BAY_ID, defaultWorkingDays: 4, name: 'Fabrication Bay' });

    expect(getBaySeedBayMap({ enabledBays: [], productBays: [productBay] }).get(ENABLED_BAY_ID)).toEqual(
      productBay.bay,
    );
  });

  it('keeps disabled Product Bays out of the selected-row display map', () => {
    const disabledProductBay = buildProductBay({
      bayId: DISABLED_BAY_ID,
      defaultWorkingDays: 6,
      disabledAt: '2026-06-01T00:00:00.000Z',
      name: 'Retired Bay',
    });

    expect(getBaySeedBayMap({ enabledBays: [], productBays: [disabledProductBay] }).has(DISABLED_BAY_ID)).toBe(false);
  });
});

function buildProductBay({
  bayId,
  defaultWorkingDays,
  disabledAt = null,
  name,
}: {
  bayId: string;
  defaultWorkingDays: number;
  disabledAt?: string | null;
  name: string;
}): ProductBay {
  return ProductBay.parse({
    bay: buildBay({ disabledAt, id: bayId, name }),
    bayId,
    defaultWorkingDays,
    productId: PRODUCT_ID,
  });
}

function buildBay({ disabledAt, id, name }: { disabledAt: string | null; id: string; name: string }): Bay {
  return Bay.parse({
    createdAt: '2026-01-01T00:00:00.000Z',
    department: 'fabrication',
    disabledAt,
    id,
    name,
    scheduleOrigin: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}
