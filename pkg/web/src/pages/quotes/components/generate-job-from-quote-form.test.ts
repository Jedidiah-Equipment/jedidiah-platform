import {
  Bay,
  BaySchedule,
  DateOnlyIso,
  type JobSchedulePreviewPlacement,
  ProductBay,
  ProjectedJobSlot,
  UUID,
} from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { selectBayCalendars } from '@/hooks/use-bay-calendars.js';
import {
  createBaySeedScheduling,
  getBaySeedBayMap,
  getBaySeedDefaultStartDate,
  getBaySeedRowScheduling,
  toJobCreateFormValues,
  toJobCreateInput,
} from './generate-job-from-quote-form.js';

const QUOTE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ENABLED_BAY_ID = '550e8400-e29b-41d4-a716-446655440002';
const DISABLED_BAY_ID = '550e8400-e29b-41d4-a716-446655440003';
const OTHER_BAY_ID = '550e8400-e29b-41d4-a716-446655440004';

const day = (value: string) => DateOnlyIso.parse(value);

function createScheduling(result: Parameters<typeof selectBayCalendars>[0]) {
  return createBaySeedScheduling(result, selectBayCalendars(result).workingCalendarsByBayId);
}

describe('createBaySeedScheduling / getBaySeedDefaultStartDate', () => {
  it('defaults a seeded Bay to its next available working day', () => {
    const scheduling = createScheduling({
      items: [buildBaySchedule({ id: ENABLED_BAY_ID, nextAvailableDate: '2026-06-15' })],
      offDays: [],
      today: day('2026-06-05'),
    });

    expect(getBaySeedDefaultStartDate(scheduling, UUID.parse(ENABLED_BAY_ID))).toBe('2026-06-15');
  });

  it('floors the default to tomorrow when the Bay queue ended in the past', () => {
    const scheduling = createScheduling({
      items: [buildBaySchedule({ id: ENABLED_BAY_ID, nextAvailableDate: '2026-06-02' })],
      offDays: [],
      today: day('2026-06-05'),
    });

    expect(getBaySeedDefaultStartDate(scheduling, UUID.parse(ENABLED_BAY_ID))).toBe('2026-06-06');
  });

  it('returns no default without schedule data for the Bay', () => {
    const scheduling = createScheduling({
      items: [buildBaySchedule({ id: ENABLED_BAY_ID, nextAvailableDate: '2026-06-15' })],
      offDays: [],
      today: day('2026-06-05'),
    });

    expect(getBaySeedDefaultStartDate(scheduling, UUID.parse(OTHER_BAY_ID))).toBe('');
    expect(getBaySeedDefaultStartDate(null, UUID.parse(ENABLED_BAY_ID))).toBe('');
  });
});

describe('getBaySeedRowScheduling', () => {
  it('returns picker bounds and a split warning naming the affected Job and durations', () => {
    const slot = buildWorkSlot({ durationDays: 10, jobCode: 'JOB-01042' });
    const scheduling = createScheduling({
      items: [
        buildBaySchedule({
          id: ENABLED_BAY_ID,
          nextAvailableDate: '2026-06-15',
          slots: [slot],
        }),
      ],
      offDays: [],
      today: day('2026-06-05'),
    });

    expect(
      getBaySeedRowScheduling(
        scheduling,
        { bayId: UUID.parse(ENABLED_BAY_ID), startDate: '2026-06-09' },
        splitPlacement(slot),
      ),
    ).toMatchObject({
      bounds: { minValue: '2026-06-06', maxValue: '2026-06-15' },
      splitWarning: "Splits JOB-01042's 10-day slot into 4 + 6.",
    });
  });

  it('reports no split warning for the default next-available date', () => {
    const scheduling = createScheduling({
      items: [
        buildBaySchedule({
          id: ENABLED_BAY_ID,
          nextAvailableDate: '2026-06-15',
          slots: [buildWorkSlot({ durationDays: 10, jobCode: 'JOB-01042' })],
        }),
      ],
      offDays: [],
      today: day('2026-06-05'),
    });

    expect(
      getBaySeedRowScheduling(scheduling, { bayId: UUID.parse(ENABLED_BAY_ID), startDate: '2026-06-15' }),
    ).toMatchObject({
      splitWarning: null,
    });
  });

  it('reports no scheduling for rows whose Bay has no schedule data', () => {
    expect(getBaySeedRowScheduling(null, { bayId: UUID.parse(ENABLED_BAY_ID), startDate: '2026-06-09' })).toBeNull();
  });
});

describe('toJobCreateFormValues', () => {
  it('prefills enabled Product Bays with default working-days and start dates', () => {
    const scheduling = createScheduling({
      items: [buildBaySchedule({ id: ENABLED_BAY_ID, nextAvailableDate: '2026-06-15' })],
      offDays: [],
      today: day('2026-06-05'),
    });

    expect(
      toJobCreateFormValues({
        productBays: [
          buildProductBay({ bayId: ENABLED_BAY_ID, defaultWorkingDays: 4, name: 'Fabrication Bay' }),
          buildProductBay({ bayId: OTHER_BAY_ID, defaultWorkingDays: 6, name: 'Paint Bay' }),
        ],
        scheduling,
      }),
    ).toEqual({
      baySeeds: [
        { bayId: ENABLED_BAY_ID, durationDays: 4, startDate: '2026-06-15' },
        { bayId: OTHER_BAY_ID, durationDays: 6, startDate: '' },
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
        scheduling: null,
      }).baySeeds,
    ).toEqual([{ bayId: ENABLED_BAY_ID, durationDays: 4, startDate: '' }]);
  });

  it('starts empty when the Product has no Product Bays', () => {
    expect(toJobCreateFormValues({ productBays: [], scheduling: null })).toEqual({ baySeeds: [] });
  });
});

describe('toJobCreateInput', () => {
  it('carries seed start dates, omitting the empty-string append fallback', () => {
    expect(
      toJobCreateInput({
        quoteId: QUOTE_ID,
        value: {
          baySeeds: [
            { bayId: ENABLED_BAY_ID, durationDays: 7, startDate: '2026-06-09' },
            { bayId: OTHER_BAY_ID, durationDays: 2, startDate: '' },
          ],
        },
      }),
    ).toEqual({
      baySeeds: [
        { bayId: ENABLED_BAY_ID, durationDays: 7, startDate: '2026-06-09' },
        { bayId: OTHER_BAY_ID, durationDays: 2 },
      ],
      quoteId: QUOTE_ID,
    });
  });
});

describe('getBaySeedBayMap', () => {
  it('uses Product Bay metadata before the enabled Bay picker finishes loading', () => {
    const productBay = buildProductBay({ bayId: ENABLED_BAY_ID, defaultWorkingDays: 4, name: 'Fabrication Bay' });

    expect(getBaySeedBayMap({ enabledBays: [], productBays: [productBay] }).get(UUID.parse(ENABLED_BAY_ID))).toEqual(
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

    expect(
      getBaySeedBayMap({ enabledBays: [], productBays: [disabledProductBay] }).has(UUID.parse(DISABLED_BAY_ID)),
    ).toBe(false);
  });
});

function buildBaySchedule({
  id,
  nextAvailableDate,
  slots = [],
}: {
  id: string;
  nextAvailableDate: string;
  slots?: ProjectedJobSlot[];
}): BaySchedule {
  return BaySchedule.parse({
    ...buildBay({ disabledAt: null, id, name: 'Fabrication Bay' }),
    calendarExceptions: [],
    nextAvailableDate,
    slots,
  });
}

function buildWorkSlot({ durationDays, jobCode }: { durationDays: number; jobCode: string }): ProjectedJobSlot {
  return ProjectedJobSlot.parse({
    bayId: ENABLED_BAY_ID,
    createdAt: '2026-06-05T08:00:00.000Z',
    durationDays,
    endDate: '2026-06-15',
    id: '00000000-0000-4000-8000-000000000001',
    jobCode,
    jobId: '00000000-0000-4000-8000-00000000aaaa',
    jobUnfinished: true,
    kind: 'work',
    label: null,
    sequence: 1,
    startDate: '2026-06-05',
    state: 'active',
    updatedAt: '2026-06-05T08:00:00.000Z',
  });
}

function splitPlacement(targetSlot: ProjectedJobSlot): JobSchedulePreviewPlacement {
  return {
    afterDays: 6,
    beforeDays: 4,
    startDate: DateOnlyIso.parse('2026-06-09'),
    targetSlot,
    type: 'split',
  };
}

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
    scheduleOrigin: '2026-06-05',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}
