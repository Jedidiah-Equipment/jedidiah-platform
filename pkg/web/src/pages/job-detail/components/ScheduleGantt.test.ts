import type { JobStageName, StationBooking } from '@pkg/schema';
import { JobDetail } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  buildScheduleGanttRows,
  formatScheduleDateTimeInputValue,
  getActualEndForDisplay,
  getScheduleGanttActualDateEdits,
  getScheduleGanttActualDisplay,
  getScheduleGanttDueDateEdits,
  getScheduleGanttDueDisplay,
  getScheduleGanttDueRangeAfterDrag,
  getScheduleGanttOccupancyDisplay,
  getScheduleGanttTimelineDayCount,
  parseScheduleDate,
  parseScheduleDateTimeInputValue,
  resolveScheduleDateTimeInputValue,
} from './schedule-gantt-helpers.js';

describe('buildScheduleGanttRows', () => {
  it('keeps the Job, every Department stage, and station bookings on the chart', () => {
    const job = createJobDetail();

    expect(buildScheduleGanttRows(job)).toEqual([
      expect.objectContaining({ id: `job-${ids.job}`, level: 'job', parentId: null, title: 'JOB-00001' }),
      expect.objectContaining({
        id: `stage-${stageIds.procurement}`,
        level: 'stage',
        parentId: null,
        title: 'Procurement',
      }),
      expect.objectContaining({
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
        id: `station-${bookingIds['procurement-1']}`,
        level: 'station',
        parentId: `stage-${stageIds.procurement}`,
        title: 'Procurement Desk',
      }),
      expect.objectContaining({ id: `stage-${stageIds.supply}`, level: 'stage', parentId: null, title: 'Supply' }),
      expect.objectContaining({
        id: `stage-${stageIds.fabrication}`,
        level: 'stage',
        parentId: null,
        title: 'Fabrication',
      }),
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        dueEnd: null,
        dueStart: null,
        id: `station-${bookingIds['fabrication-1']}`,
        level: 'station',
        parentId: `stage-${stageIds.fabrication}`,
        title: 'Weld Bay',
      }),
      expect.objectContaining({ id: `stage-${stageIds.paint}`, level: 'stage', parentId: null, title: 'Paint' }),
      expect.objectContaining({ id: `stage-${stageIds.assembly}`, level: 'stage', parentId: null, title: 'Assembly' }),
    ]);
  });

  it('renders shared-station occupancy as actual ranges before due ranges', () => {
    const actualDisplay = getScheduleGanttOccupancyDisplay(
      {
        actualEnd: '2026-05-04T16:00:00.000Z',
        actualStart: '2026-05-02T08:00:00.000Z',
        dueEnd: '2026-05-05',
        dueStart: '2026-05-01',
        id: bookingIds['fabrication-1'],
        jobStageId: stageIds.fabrication,
        stage: 'fabrication',
        stationId: stationIds['fabrication-1'],
        stationName: 'Weld Bay',
      },
      'JOB-00002',
    );
    const dueDisplay = getScheduleGanttOccupancyDisplay(
      {
        actualEnd: null,
        actualStart: null,
        dueEnd: '2026-05-05',
        dueStart: '2026-05-03',
        id: bookingIds['fabrication-1'],
        jobStageId: stageIds.fabrication,
        stage: 'fabrication',
        stationId: stationIds['fabrication-1'],
        stationName: 'Weld Bay',
      },
      'JOB-00002',
    );

    expect(actualDisplay).toMatchObject({
      label: 'JOB-00002 actual on Weld Bay',
      openEnded: false,
    });
    if (actualDisplay.kind === 'none' || dueDisplay.kind === 'none') {
      throw new Error('Expected occupancy ranges.');
    }
    expect(toLocalDateKey(actualDisplay.start)).toBe('2026-05-02');
    expect(toLocalDateKey(dueDisplay.start)).toBe('2026-05-03');
    expect(toLocalDateKey(dueDisplay.end)).toBe('2026-05-06');
  });
});

describe('schedule date display helpers', () => {
  it('renders due ranges as inclusive planned tracks', () => {
    const display = getScheduleGanttDueDisplay({
      dueEnd: '2026-05-03',
      dueStart: '2026-05-01',
    });

    expect(display).toMatchObject({
      kind: 'range',
      label: 'Due May 1, 2026 to May 3, 2026',
    });
    if (display.kind !== 'range') throw new Error('Expected range display.');
    expect(toLocalDateKey(display.start)).toBe('2026-05-01');
    expect(toLocalDateKey(display.end)).toBe('2026-05-04');
  });

  it.each([
    ['start-only', { dueEnd: null, dueStart: '2026-05-01' }, 'Due start May 1, 2026'],
    ['end-only', { dueEnd: '2026-05-03', dueStart: null }, 'Due end May 3, 2026'],
  ])('renders %s due dates as milestones', (_case, row, label) => {
    expect(getScheduleGanttDueDisplay(row)).toMatchObject({
      kind: 'milestone',
      label,
    });
  });

  it('returns no due display when both due dates are missing', () => {
    expect(getScheduleGanttDueDisplay({ dueEnd: null, dueStart: null })).toEqual({ kind: 'none' });
  });

  it('runs in-progress actuals through the supplied today marker', () => {
    const now = new Date('2026-05-22T09:30:00.000Z');

    expect(
      getScheduleGanttActualDisplay(
        {
          actualEnd: null,
          actualStart: '2026-05-20T08:00:00.000Z',
        },
        now,
      ),
    ).toMatchObject({
      kind: 'range',
      label: 'Actual May 20, 2026 through today',
      openEnded: true,
    });
    const display = getScheduleGanttActualDisplay(
      {
        actualEnd: null,
        actualStart: '2026-05-20T08:00:00.000Z',
      },
      now,
    );
    if (display.kind !== 'range') throw new Error('Expected range display.');
    expect(toLocalDateKey(display.start)).toBe('2026-05-20');
    expect(toLocalDateKey(display.end)).toBe('2026-05-23');
  });

  it('normalizes completed actual ends to the next day for inclusive daily width', () => {
    expect(
      getScheduleGanttActualDisplay(
        {
          actualEnd: '2026-05-21T17:00:00.000Z',
          actualStart: '2026-05-20T08:00:00.000Z',
        },
        new Date('2026-05-22T09:30:00.000Z'),
      ),
    ).toMatchObject({
      kind: 'range',
      label: 'Actual May 20, 2026 to May 21, 2026',
      openEnded: false,
    });
    const display = getScheduleGanttActualDisplay(
      {
        actualEnd: '2026-05-21T17:00:00.000Z',
        actualStart: '2026-05-20T08:00:00.000Z',
      },
      new Date('2026-05-22T09:30:00.000Z'),
    );
    if (display.kind !== 'range') throw new Error('Expected range display.');
    expect(toLocalDateKey(display.start)).toBe('2026-05-20');
    expect(toLocalDateKey(display.end)).toBe('2026-05-22');
  });

  it('keeps future in-progress actuals visible for at least one day', () => {
    expect(
      getActualEndForDisplay(new Date('2026-05-24T00:00:00.000Z'), null, new Date('2026-05-22T09:30:00.000Z')),
    ).toEqual(new Date('2026-05-25T00:00:00.000Z'));
  });

  it('parses schedule dates to day starts', () => {
    const parsed = parseScheduleDate('2026-05-20T08:00:00.000Z');

    expect(parsed ? toLocalDateKey(parsed) : null).toBe('2026-05-20');
    expect(parsed?.getHours()).toBe(0);
    expect(parsed?.getMinutes()).toBe(0);
  });

  it('derives row width from the currently loaded timeline years', () => {
    expect(
      getScheduleGanttTimelineDayCount([
        { quarters: [{ months: [{ days: 31 }, { days: 29 }, { days: 31 }] }] },
        { quarters: [{ months: [{ days: 31 }, { days: 28 }] }] },
      ]),
    ).toBe(150);
  });

  it('moves a due range by whole days', () => {
    expect(
      getScheduleGanttDueRangeAfterDrag({
        action: 'move',
        dayDelta: 2,
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
      }),
    ).toEqual({
      dueEnd: '2026-05-05',
      dueStart: '2026-05-03',
    });
  });

  it('resizes due ranges from either edge', () => {
    expect(
      getScheduleGanttDueRangeAfterDrag({
        action: 'resize-start',
        dayDelta: -1,
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
      }),
    ).toEqual({
      dueEnd: '2026-05-03',
      dueStart: '2026-04-30',
    });
    expect(
      getScheduleGanttDueRangeAfterDrag({
        action: 'resize-end',
        dayDelta: 2,
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
      }),
    ).toEqual({
      dueEnd: '2026-05-05',
      dueStart: '2026-05-01',
    });
  });

  it('collapses inverted edge resizes to a one-day range', () => {
    expect(
      getScheduleGanttDueRangeAfterDrag({
        action: 'resize-start',
        dayDelta: 5,
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
      }),
    ).toEqual({
      dueEnd: '2026-05-06',
      dueStart: '2026-05-06',
    });
  });

  it('orders two date edits so each intermediate due range stays valid', () => {
    expect(
      getScheduleGanttDueDateEdits({
        entityId: ids.job,
        entityLevel: 'job',
        nextDueEnd: '2026-05-12',
        nextDueStart: '2026-05-10',
        previousDueEnd: '2026-05-03',
        previousDueStart: '2026-05-01',
      }).map((edit) => edit.field),
    ).toEqual(['due_end', 'due_start']);

    expect(
      getScheduleGanttDueDateEdits({
        entityId: ids.job,
        entityLevel: 'job',
        nextDueEnd: '2026-04-27',
        nextDueStart: '2026-04-25',
        previousDueEnd: '2026-05-03',
        previousDueStart: '2026-05-01',
      }).map((edit) => edit.field),
    ).toEqual(['due_start', 'due_end']);
  });

  it('formats and parses local date-time picker values for actuals', () => {
    const localDate = new Date(2026, 4, 22, 9, 30);

    expect(formatScheduleDateTimeInputValue(localDate.toISOString())).toBe('2026-05-22T09:30');
    expect(parseScheduleDateTimeInputValue('2026-05-22T09:30')).toBe(localDate.toISOString());
    expect(parseScheduleDateTimeInputValue('not-a-date')).toBeNull();
  });

  it('keeps the original actual datetime when the minute-level input is unchanged', () => {
    const originalValue = '2026-05-22T09:30:12.345Z';

    expect(resolveScheduleDateTimeInputValue(formatScheduleDateTimeInputValue(originalValue), originalValue)).toBe(
      originalValue,
    );
  });

  it('creates actual datetime edits for changed fields only', () => {
    expect(
      getScheduleGanttActualDateEdits({
        entityId: ids.job,
        entityLevel: 'job',
        nextActualEnd: '2026-05-23T12:00:00.000Z',
        nextActualStart: '2026-05-22T08:00:00.000Z',
        previousActualEnd: '2026-05-22T12:00:00.000Z',
        previousActualStart: '2026-05-22T08:00:00.000Z',
      }),
    ).toEqual([
      {
        entityId: ids.job,
        entityLevel: 'job',
        field: 'actual_end',
        value: '2026-05-23T12:00:00.000Z',
      },
    ]);
  });

  it('does not create actual datetime edits for unchanged minute-level inputs with stored seconds', () => {
    const actualStart = '2026-05-22T08:00:12.345Z';
    const actualEnd = '2026-05-22T12:00:45.678Z';

    expect(
      getScheduleGanttActualDateEdits({
        entityId: ids.job,
        entityLevel: 'job',
        nextActualEnd: resolveScheduleDateTimeInputValue(formatScheduleDateTimeInputValue(actualEnd), actualEnd),
        nextActualStart:
          resolveScheduleDateTimeInputValue(formatScheduleDateTimeInputValue(actualStart), actualStart) ?? actualStart,
        previousActualEnd: actualEnd,
        previousActualStart: actualStart,
      }),
    ).toEqual([]);
  });

  it('creates an actual end edit when clearing an existing actual end', () => {
    expect(
      getScheduleGanttActualDateEdits({
        entityId: ids.job,
        entityLevel: 'job',
        nextActualEnd: null,
        nextActualStart: '2026-05-22T08:00:00.000Z',
        previousActualEnd: '2026-05-23T12:00:00.000Z',
        previousActualStart: '2026-05-22T08:00:00.000Z',
      }),
    ).toEqual([
      {
        entityId: ids.job,
        entityLevel: 'job',
        field: 'actual_end',
        value: null,
      },
    ]);
  });

  it('orders actual datetime edits so each intermediate range stays valid', () => {
    expect(
      getScheduleGanttActualDateEdits({
        entityId: ids.job,
        entityLevel: 'job',
        nextActualEnd: '2026-05-23T12:00:00.000Z',
        nextActualStart: '2026-05-23T08:00:00.000Z',
        previousActualEnd: '2026-05-22T12:00:00.000Z',
        previousActualStart: '2026-05-22T08:00:00.000Z',
      }).map((edit) => edit.field),
    ).toEqual(['actual_end', 'actual_start']);
  });
});

function createJobDetail(): JobDetail {
  const stages = [
    createStage('procurement', 1, [
      createStationBooking('procurement-1', 'Procurement Desk', {
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
      }),
    ]),
    createStage('supply', 2),
    createStage('fabrication', 3, [createStationBooking('fabrication-1', 'Weld Bay')]),
    createStage('paint', 4),
    createStage('assembly', 5),
  ];

  return JobDetail.parse({
    actualEnd: null,
    actualEndSetManually: false,
    actualStart: '2026-05-01T08:00:00.000Z',
    actualStartSetManually: false,
    code: 'JOB-00001',
    createdAt: '2026-05-01T08:00:00.000Z',
    customerCompanyName: 'ACME',
    dueDate: '2026-05-12',
    dueEnd: '2026-05-10',
    dueEndSetManually: false,
    dueStart: '2026-05-01',
    dueStartSetManually: false,
    id: ids.job,
    isCancelled: false,
    isPaused: false,
    lifecycleStatus: 'active',
    productId: ids.product,
    productModelCode: 'MODEL',
    productName: 'Machine',
    quoteCode: null,
    quoteId: null,
    stages,
    updatedAt: '2026-05-01T08:00:00.000Z',
    workflowEvents: [],
  });
}

function createStage(stage: JobStageName, sequence: number, stations: StationBooking[] = []) {
  return {
    access: 'visible',
    actualEnd: null,
    actualEndSetManually: false,
    actualStart: null,
    actualStartSetManually: false,
    department: stage,
    dueEnd: null,
    dueEndSetManually: false,
    dueStart: null,
    dueStartSetManually: false,
    id: stageIds[stage],
    jobId: ids.job,
    sequence,
    stage,
    state: 'pending',
    stations,
    transitionAvailability: {
      start: { allowed: true, reason: null },
      stop: { allowed: false, reason: 'Not started' },
    },
  };
}

function createStationBooking(
  id: 'fabrication-1' | 'procurement-1',
  name: string,
  dates: { dueEnd?: string; dueStart?: string } = {},
): StationBooking {
  const stage = id.startsWith('procurement') ? 'procurement' : 'fabrication';

  return {
    actualEnd: null,
    actualEndSetManually: false,
    actualStart: null,
    actualStartSetManually: false,
    createdAt: '2026-05-01T08:00:00.000Z',
    dueEnd: dates.dueEnd ?? null,
    dueEndSetManually: false,
    dueStart: dates.dueStart ?? null,
    dueStartSetManually: false,
    id: bookingIds[id],
    jobStageId: stageIds[stage],
    state: 'pending',
    station: {
      createdAt: '2026-05-01T08:00:00.000Z',
      department: stage,
      displayOrder: 0,
      id: stationIds[id],
      isActive: true,
      name,
      updatedAt: '2026-05-01T08:00:00.000Z',
    },
    stationId: stationIds[id],
    updatedAt: '2026-05-01T08:00:00.000Z',
  };
}

const ids = {
  job: '00000000-0000-4000-8000-000000000001',
  product: '00000000-0000-4000-8000-000000000002',
} as const;

const stageIds = {
  procurement: '00000000-0000-4000-8000-000000000101',
  supply: '00000000-0000-4000-8000-000000000102',
  fabrication: '00000000-0000-4000-8000-000000000103',
  paint: '00000000-0000-4000-8000-000000000104',
  assembly: '00000000-0000-4000-8000-000000000105',
} as const satisfies Record<JobStageName, string>;

const bookingIds = {
  'procurement-1': '00000000-0000-4000-8000-000000000201',
  'fabrication-1': '00000000-0000-4000-8000-000000000202',
} as const;

const stationIds = {
  'procurement-1': '00000000-0000-4000-8000-000000000301',
  'fabrication-1': '00000000-0000-4000-8000-000000000302',
} as const;

function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
