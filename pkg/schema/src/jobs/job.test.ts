import { describe, expect, it } from 'vitest';

import {
  AddBayCalendarExceptionInput,
  AddBayCalendarExceptionResult,
  AddIdleJobSlotInput,
  AddIdleJobSlotResult,
  BayCalendarException,
  BayCalendarExceptionDirection,
  BayListResult,
  BookJobSlotInput,
  BookJobSlotResult,
  formatProductSerialNumber,
  Job,
  JobCode,
  JobDetail,
  JobListFilters,
  OffDay,
  ProjectedJobSlot,
  RemoveBayCalendarExceptionInput,
  RemoveBayCalendarExceptionResult,
  RemoveJobSlotInput,
  RemoveJobSlotResult,
  ResizeJobSlotInput,
  ResizeJobSlotResult,
  ToggleOffDayInput,
  ToggleOffDayResult,
} from './job.js';

describe('JobCode', () => {
  it('formats DB integers as branded job codes', () => {
    expect(JobCode.parse(1)).toBe('JOB-00001');
    expect(JobCode.parse(100_000)).toBe('JOB-100000');
  });
});

describe('formatProductSerialNumber', () => {
  it('combines product model code, two-digit year, and padded product sequence', () => {
    expect(formatProductSerialNumber({ prefix: 'SG1836', sequence: 9, year: 26 })).toBe('SG1836260009');
    expect(formatProductSerialNumber({ prefix: 'SG1836', sequence: 10_000, year: 27 })).toBe('SG18362710000');
  });
});

describe('Job', () => {
  it('carries the frozen product serial facts', () => {
    expect(
      Job.parse({
        code: 1,
        createdAt: '2026-06-01T00:00:00.000Z',
        id: '00000000-0000-4000-8000-000000000001',
        productId: '00000000-0000-4000-8000-000000000002',
        productSerialNumber: 'SG1836260009',
        productSerialPrefix: 'SG1836',
        productSerialSequence: 9,
        productSerialYear: 26,
        quoteId: '00000000-0000-4000-8000-000000000003',
        updatedAt: '2026-06-01T00:00:00.000Z',
        vinNumber: null,
      }),
    ).toMatchObject({
      code: 'JOB-00001',
      productSerialNumber: 'SG1836260009',
      productSerialPrefix: 'SG1836',
      productSerialSequence: 9,
      productSerialYear: 26,
      vinNumber: null,
    });
  });
});

describe('Working Calendar schemas', () => {
  it('accepts off-days and bay exceptions with nullable labels', () => {
    expect(
      OffDay.parse({
        date: '2026-06-16',
        label: 'Youth Day',
      }),
    ).toEqual({
      date: '2026-06-16',
      label: 'Youth Day',
    });
    expect(
      BayCalendarException.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        date: '2026-06-20',
        direction: 'work',
        label: null,
      }),
    ).toEqual({
      bayId: '00000000-0000-4000-8000-000000000001',
      date: '2026-06-20',
      direction: 'work',
      label: null,
    });
  });

  it('normalizes empty write labels to null', () => {
    expect(
      ToggleOffDayInput.parse({
        date: '2026-06-16',
        isOffDay: true,
        label: '  ',
      }),
    ).toEqual({
      date: '2026-06-16',
      isOffDay: true,
      label: null,
    });
    expect(
      AddBayCalendarExceptionInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        date: '2026-06-20',
        direction: 'off',
        label: '  Bay maintenance  ',
      }),
    ).toEqual({
      bayId: '00000000-0000-4000-8000-000000000001',
      date: '2026-06-20',
      direction: 'off',
      label: 'Bay maintenance',
    });
  });

  it('accepts mutation results and bay list calendar facts', () => {
    const exception = {
      bayId: '00000000-0000-4000-8000-000000000001',
      date: '2026-06-20',
      direction: 'work',
      label: null,
    } as const;

    expect(AddBayCalendarExceptionResult.parse({ exception })).toEqual({ exception });
    expect(RemoveBayCalendarExceptionResult.parse({ exception })).toEqual({ exception });
    expect(RemoveBayCalendarExceptionResult.parse({ exception: null })).toEqual({ exception: null });
    expect(
      ToggleOffDayResult.parse({
        offDay: {
          date: '2026-06-16',
          label: null,
        },
      }),
    ).toEqual({
      offDay: {
        date: '2026-06-16',
        label: null,
      },
    });
    expect(ToggleOffDayResult.parse({ offDay: null })).toEqual({ offDay: null });
    expect(
      BayListResult.parse({
        items: [
          {
            calendarExceptions: [exception],
            createdAt: '2026-06-01T00:00:00.000Z',
            department: 'fabrication',
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Fabrication Bay 1',
            nextAvailableAt: '2026-06-05T00:00:00.000Z',
            scheduleOrigin: '2026-06-05T00:00:00.000Z',
            slots: [],
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
        offDays: [
          {
            date: '2026-06-16',
            label: 'Youth Day',
          },
        ],
      }),
    ).toEqual({
      items: [
        {
          calendarExceptions: [exception],
          createdAt: '2026-06-01T00:00:00.000Z',
          department: 'fabrication',
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Fabrication Bay 1',
          nextAvailableAt: '2026-06-05T00:00:00.000Z',
          scheduleOrigin: '2026-06-05T00:00:00.000Z',
          slots: [],
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      offDays: [
        {
          date: '2026-06-16',
          label: 'Youth Day',
        },
      ],
    });
  });

  it('accepts bay exception removal by bay and date', () => {
    expect(
      RemoveBayCalendarExceptionInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        date: '2026-06-20',
      }),
    ).toEqual({
      bayId: '00000000-0000-4000-8000-000000000001',
      date: '2026-06-20',
    });
  });

  it('rejects bad shapes and unknown fields', () => {
    expect(() => BayCalendarExceptionDirection.parse('maybe')).toThrow();
    expect(() =>
      BayCalendarException.parse({
        bayId: 'not-a-uuid',
        date: '2026-06-20',
        direction: 'work',
        label: null,
      }),
    ).toThrow();
    expect(() =>
      OffDay.parse({
        date: '2026-06-20T00:00:00.000Z',
        label: null,
      }),
    ).toThrow();
    expect(() =>
      ToggleOffDayInput.parse({
        date: '2026-06-20',
        extra: true,
        isOffDay: false,
      }),
    ).toThrow();
  });
});

describe('JobListFilters', () => {
  it('defaults to no job list filters', () => {
    expect(JobListFilters.parse(undefined)).toEqual({});
  });

  it('allows other filters without status filters', () => {
    expect(JobListFilters.parse({ jobId: '00000000-0000-4000-8000-000000000001' })).toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
    });
  });
});

describe('JobDetail', () => {
  it('carries part units in the CFO projection', () => {
    expect(
      JobDetail.shape.cfo.parse([
        {
          assemblyName: 'Hydraulics',
          kind: 'standard',
          parts: [
            {
              partCode: 'HOSE-001',
              partId: '00000000-0000-4000-8000-000000000001',
              partName: 'Hydraulic Hose',
              quantity: 6000,
              unitOfMeasure: 'mm',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        assemblyName: 'Hydraulics',
        kind: 'standard',
        parts: [
          {
            partCode: 'HOSE-001',
            partId: '00000000-0000-4000-8000-000000000001',
            partName: 'Hydraulic Hose',
            quantity: 6000,
            unitOfMeasure: 'mm',
          },
        ],
      },
    ]);
  });
});

describe('JobSlot schemas', () => {
  it('accepts booking inputs with positive day durations', () => {
    expect(
      BookJobSlotInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        durationDays: 1,
        jobId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toMatchObject({
      durationDays: 1,
    });
    expect(() =>
      BookJobSlotInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        durationDays: 0,
        jobId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toThrow();
  });

  it('normalizes projected work slot dates and job codes at the schema boundary', () => {
    expect(
      ProjectedJobSlot.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
        durationDays: 1,
        endAt: new Date('2026-06-06T00:00:00.000Z'),
        id: '00000000-0000-4000-8000-000000000003',
        jobCode: 12,
        jobId: '00000000-0000-4000-8000-000000000002',
        kind: 'work',
        label: null,
        sequence: 1,
        startAt: new Date('2026-06-05T00:00:00.000Z'),
        updatedAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    ).toMatchObject({
      endAt: '2026-06-06T00:00:00.000Z',
      jobCode: 'JOB-00012',
      startAt: '2026-06-05T00:00:00.000Z',
    });
  });

  it('normalizes projected idle slots without job fields', () => {
    expect(
      ProjectedJobSlot.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
        durationDays: 1,
        endAt: new Date('2026-06-06T00:00:00.000Z'),
        id: '00000000-0000-4000-8000-000000000003',
        jobId: null,
        kind: 'idle',
        label: 'Idle gap',
        sequence: 1,
        startAt: new Date('2026-06-05T00:00:00.000Z'),
        updatedAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    ).toMatchObject({
      endAt: '2026-06-06T00:00:00.000Z',
      kind: 'idle',
      label: 'Idle gap',
      startAt: '2026-06-05T00:00:00.000Z',
    });
  });

  it('returns the inserted slot from booking mutations without projection fields', () => {
    expect(
      BookJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: '00000000-0000-4000-8000-000000000002',
          kind: 'work',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        createdAt: '2026-06-05T00:00:00.000Z',
        durationDays: 1,
        sequence: 1,
      },
    });
  });

  it('accepts resize inputs with positive day durations', () => {
    expect(
      ResizeJobSlotInput.parse({
        durationDays: 2,
        slotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toMatchObject({
      durationDays: 2,
    });
    expect(() =>
      ResizeJobSlotInput.parse({
        durationDays: 0,
        slotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
  });

  it('returns the resized slot without projection fields', () => {
    expect(
      ResizeJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 2,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: '00000000-0000-4000-8000-000000000002',
          kind: 'work',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        durationDays: 2,
        updatedAt: '2026-06-06T00:00:00.000Z',
      },
    });
  });

  it('accepts remove inputs with a valid slot id', () => {
    expect(
      RemoveJobSlotInput.parse({
        slotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toMatchObject({
      slotId: '00000000-0000-4000-8000-000000000003',
    });
    expect(() =>
      RemoveJobSlotInput.parse({
        slotId: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('returns the removed slot without projection fields', () => {
    expect(
      RemoveJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: null,
          kind: 'idle',
          label: null,
          sequence: 2,
          updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        createdAt: '2026-06-05T00:00:00.000Z',
        sequence: 2,
        updatedAt: '2026-06-06T00:00:00.000Z',
      },
    });
  });

  it('requires work slots to have a job and idle slots to have no job', () => {
    expect(() =>
      BookJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: null,
          kind: 'work',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      }),
    ).toThrow();

    expect(() =>
      RemoveJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: '00000000-0000-4000-8000-000000000002',
          kind: 'idle',
          label: null,
          sequence: 1,
          updatedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      }),
    ).toThrow();
  });

  it('accepts target-slot idle insertion inputs', () => {
    expect(
      AddIdleJobSlotInput.parse({
        durationDays: 1,
        label: null,
        placement: 'before',
        targetSlotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toEqual({
      durationDays: 1,
      label: null,
      placement: 'before',
      targetSlotId: '00000000-0000-4000-8000-000000000003',
    });
    expect(() =>
      AddIdleJobSlotInput.parse({
        durationDays: 0,
        placement: 'after',
        targetSlotId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
  });

  it('returns the inserted idle slot without a persisted default label', () => {
    expect(
      AddIdleJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationDays: 1,
          id: '00000000-0000-4000-8000-000000000003',
          jobId: null,
          kind: 'idle',
          label: null,
          sequence: 2,
          updatedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        kind: 'idle',
        label: null,
        sequence: 2,
      },
    });
  });
});
