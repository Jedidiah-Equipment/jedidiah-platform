import { Bay, DateOnlyIso, ProductBay, ProjectedBayQueue } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { selectBayCalendars } from '@/hooks/use-bay-calendars.js';

import { createBaySeedScheduling } from './job-bay-seeds.js';
import {
  emptyStockBuildFormValues,
  StockBuildFormValues,
  toStockBuildBaySeeds,
  toStockBuildCreateInput,
} from './stock-build-form.js';

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ASSEMBLY_ID = '550e8400-e29b-41d4-a716-446655440005';
const ENABLED_BAY_ID = '550e8400-e29b-41d4-a716-446655440002';
const DISABLED_BAY_ID = '550e8400-e29b-41d4-a716-446655440003';

describe('StockBuildFormValues', () => {
  it('refuses to submit without a Product, since a Stock Build is a build of something', () => {
    expect(StockBuildFormValues.safeParse(emptyStockBuildFormValues).success).toBe(false);
  });

  it('accepts a Product with no Optional Assemblies — a base-spec showroom machine', () => {
    expect(StockBuildFormValues.safeParse({ ...emptyStockBuildFormValues, productId: PRODUCT_ID }).success).toBe(true);
  });
});

describe('toStockBuildBaySeeds', () => {
  it('seeds the Product’s enabled Bays at their default working days and next available date', () => {
    const boardResult = {
      items: [buildProjectedBayQueue({ id: ENABLED_BAY_ID, nextAvailableDate: '2026-06-15' })],
      offDays: [],
      today: DateOnlyIso.parse('2026-06-05'),
    };

    expect(
      toStockBuildBaySeeds({
        productBays: [
          buildProductBay({ bayId: ENABLED_BAY_ID, defaultWorkingDays: 4 }),
          buildProductBay({ bayId: DISABLED_BAY_ID, defaultWorkingDays: 6, disabledAt: '2026-06-01T00:00:00.000Z' }),
        ],
        scheduling: createBaySeedScheduling(boardResult, selectBayCalendars(boardResult).workingCalendarsByBayId),
      }),
    ).toEqual([{ bayId: ENABLED_BAY_ID, durationDays: 4, startDate: '2026-06-15' }]);
  });

  it('starts empty when the Product has no Product Bays', () => {
    expect(toStockBuildBaySeeds({ productBays: [], scheduling: null })).toEqual([]);
  });
});

describe('toStockBuildCreateInput', () => {
  it('sends the Build Spec and the seed dates, omitting the empty-string append fallback', () => {
    expect(
      toStockBuildCreateInput({
        baySeeds: [
          { bayId: ENABLED_BAY_ID, durationDays: 7, startDate: '2026-06-09' },
          { bayId: DISABLED_BAY_ID, durationDays: 2, startDate: '' },
        ],
        buildSpecAssemblyIds: [ASSEMBLY_ID],
        productId: PRODUCT_ID,
      }),
    ).toEqual({
      baySeeds: [
        { bayId: ENABLED_BAY_ID, durationDays: 7, startDate: '2026-06-09' },
        { bayId: DISABLED_BAY_ID, durationDays: 2 },
      ],
      buildSpecAssemblyIds: [ASSEMBLY_ID],
      productId: PRODUCT_ID,
    });
  });

  it('carries no commercial facts and no Quote', () => {
    const input = toStockBuildCreateInput({
      baySeeds: [],
      buildSpecAssemblyIds: [],
      productId: PRODUCT_ID,
    });

    expect(Object.keys(input).sort()).toEqual(['baySeeds', 'buildSpecAssemblyIds', 'productId']);
  });
});

function buildProjectedBayQueue({
  id,
  nextAvailableDate,
}: {
  id: string;
  nextAvailableDate: string;
}): ProjectedBayQueue {
  return ProjectedBayQueue.parse({
    ...buildBay({ disabledAt: null, id }),
    calendarExceptions: [],
    nextAvailableDate,
    slots: [],
  });
}

function buildProductBay({
  bayId,
  defaultWorkingDays,
  disabledAt = null,
}: {
  bayId: string;
  defaultWorkingDays: number;
  disabledAt?: string | null;
}): ProductBay {
  return ProductBay.parse({
    bay: buildBay({ disabledAt, id: bayId }),
    bayId,
    defaultWorkingDays,
    productId: PRODUCT_ID,
  });
}

function buildBay({ disabledAt, id }: { disabledAt: string | null; id: string }): Bay {
  return Bay.parse({
    createdAt: '2026-01-01T00:00:00.000Z',
    department: 'fabrication',
    disabledAt,
    id,
    name: 'Fabrication Bay',
    scheduleOrigin: '2026-06-05',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}
