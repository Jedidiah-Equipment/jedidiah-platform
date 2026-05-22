import { rollupJobSchedule, rollupStageSchedule, type ScheduleRollupWindow } from '@pkg/domain';
import type { JobStageName, StationBooking } from '@pkg/schema';
import { JobDetail } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  buildScheduleGanttRows,
  formatScheduleDateTimeInputValue,
  getActualEndForDisplay,
  getScheduleGanttActualDateEdits,
  getScheduleGanttActualDisplay,
  getScheduleGanttActualRangeAfterDrag,
  getScheduleGanttOccupancyDisplay,
  getScheduleGanttPlannedDateEdits,
  getScheduleGanttPlannedDisplay,
  getScheduleGanttPlannedRangeAfterDrag,
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
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
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
        plannedEnd: null,
        plannedStart: null,
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
        plannedEnd: '2026-05-05',
        plannedStart: '2026-05-01',
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
        plannedEnd: '2026-05-05',
        plannedStart: '2026-05-03',
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
  it('renders planned ranges as inclusive planned tracks', () => {
    const display = getScheduleGanttPlannedDisplay({
      plannedEnd: '2026-05-03',
      plannedStart: '2026-05-01',
    });

    expect(display).toMatchObject({
      kind: 'range',
      label: 'Planned May 1, 2026 to May 3, 2026',
    });
    if (display.kind !== 'range') throw new Error('Expected range display.');
    expect(toLocalDateKey(display.start)).toBe('2026-05-01');
    expect(toLocalDateKey(display.end)).toBe('2026-05-04');
  });

  it.each([
    ['start-only', { plannedEnd: null, plannedStart: '2026-05-01' }, 'Planned start May 1, 2026'],
    ['end-only', { plannedEnd: '2026-05-03', plannedStart: null }, 'Planned end May 3, 2026'],
  ])('renders %s planned dates as milestones', (_case, row, label) => {
    expect(getScheduleGanttPlannedDisplay(row)).toMatchObject({
      kind: 'milestone',
      label,
    });
  });

  it('returns no due display when both due dates are missing', () => {
    expect(getScheduleGanttPlannedDisplay({ plannedEnd: null, plannedStart: null })).toEqual({ kind: 'none' });
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
      getScheduleGanttPlannedRangeAfterDrag({
        action: 'move',
        dayDelta: 2,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
      }),
    ).toEqual({
      plannedEnd: '2026-05-05',
      plannedStart: '2026-05-03',
    });
  });

  it('resizes due ranges from either edge', () => {
    expect(
      getScheduleGanttPlannedRangeAfterDrag({
        action: 'resize-start',
        dayDelta: -1,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
      }),
    ).toEqual({
      plannedEnd: '2026-05-03',
      plannedStart: '2026-04-30',
    });
    expect(
      getScheduleGanttPlannedRangeAfterDrag({
        action: 'resize-end',
        dayDelta: 2,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
      }),
    ).toEqual({
      plannedEnd: '2026-05-05',
      plannedStart: '2026-05-01',
    });
  });

  it('collapses inverted edge resizes to a one-day range', () => {
    expect(
      getScheduleGanttPlannedRangeAfterDrag({
        action: 'resize-start',
        dayDelta: 5,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
      }),
    ).toEqual({
      plannedEnd: '2026-05-06',
      plannedStart: '2026-05-06',
    });
  });

  it('orders two date edits so each intermediate due range stays valid', () => {
    expect(
      getScheduleGanttPlannedDateEdits({
        entityId: ids.job,
        entityLevel: 'job',
        nextPlannedEnd: '2026-05-12',
        nextPlannedStart: '2026-05-10',
        previousPlannedEnd: '2026-05-03',
        previousPlannedStart: '2026-05-01',
      }).map((edit) => edit.field),
    ).toEqual(['planned_end', 'planned_start']);

    expect(
      getScheduleGanttPlannedDateEdits({
        entityId: ids.job,
        entityLevel: 'job',
        nextPlannedEnd: '2026-04-27',
        nextPlannedStart: '2026-04-25',
        previousPlannedEnd: '2026-05-03',
        previousPlannedStart: '2026-05-01',
      }).map((edit) => edit.field),
    ).toEqual(['planned_start', 'planned_end']);
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

  it('moves and resizes actual ranges by whole days', () => {
    expect(
      getScheduleGanttActualRangeAfterDrag({
        action: 'move',
        actualEnd: '2026-05-22T12:00:00.000Z',
        actualStart: '2026-05-20T08:00:00.000Z',
        dayDelta: 2,
      }),
    ).toEqual({
      actualEnd: '2026-05-24T12:00:00.000Z',
      actualStart: '2026-05-22T08:00:00.000Z',
    });

    expect(
      getScheduleGanttActualRangeAfterDrag({
        action: 'resize-start',
        actualEnd: '2026-05-22T12:00:00.000Z',
        actualStart: '2026-05-20T08:00:00.000Z',
        dayDelta: 1,
      }),
    ).toEqual({
      actualEnd: '2026-05-22T12:00:00.000Z',
      actualStart: '2026-05-21T08:00:00.000Z',
    });
  });
});

function createJobDetail(): JobDetail {
  const stages = [
    createStage('procurement', 1, [
      createStationBooking('procurement-1', 'Procurement Desk', {
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
      }),
    ]),
    createStage('supply', 2),
    createStage('fabrication', 3, [createStationBooking('fabrication-1', 'Weld Bay')]),
    createStage('paint', 4),
    createStage('assembly', 5),
  ];
  const jobSchedule = rollupJobSchedule(
    stages.map((stage) => ({
      bookings: toScheduleRollupBookings(stage.stations),
    })),
  );

  return JobDetail.parse({
    actualEnd: null,
    actualStart: '2026-05-01T08:00:00.000Z',
    actualWindow: toSchemaWindow(jobSchedule.actualWindow),
    code: 'JOB-00001',
    createdAt: '2026-05-01T08:00:00.000Z',
    customerCompanyName: 'ACME',
    dueDate: '2026-05-12',
    plannedEnd: '2026-05-10',
    plannedStart: '2026-05-01',
    id: ids.job,
    status: 'active',
    plannedWindow: toSchemaWindow(jobSchedule.plannedWindow),
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
  const stageSchedule = rollupStageSchedule(toScheduleRollupBookings(stations));

  return {
    access: 'visible',
    actualEnd: null,
    actualStart: null,
    actualWindow: toSchemaWindow(stageSchedule.actualWindow),
    department: stage,
    plannedEnd: null,
    plannedStart: null,
    id: stageIds[stage],
    jobId: ids.job,
    plannedWindow: toSchemaWindow(stageSchedule.plannedWindow),
    sequence,
    stage,
    state: 'pending',
    stations,
  };
}

function toScheduleRollupBookings(stations: StationBooking[]) {
  return stations.map((station) => ({
    actualEnd: station.actualEnd ? new Date(station.actualEnd) : null,
    actualStart: station.actualStart ? new Date(station.actualStart) : null,
    plannedEnd: station.plannedEnd ? new Date(`${station.plannedEnd}T00:00:00.000Z`) : null,
    plannedStart: station.plannedStart ? new Date(`${station.plannedStart}T00:00:00.000Z`) : null,
  }));
}

function toSchemaWindow(window: ScheduleRollupWindow) {
  return {
    end: window.end?.toISOString() ?? null,
    start: window.start?.toISOString() ?? null,
  };
}

function createStationBooking(
  id: 'fabrication-1' | 'procurement-1',
  name: string,
  dates: { plannedEnd?: string; plannedStart?: string } = {},
): StationBooking {
  const stage = id.startsWith('procurement') ? 'procurement' : 'fabrication';

  return {
    actualEnd: null,
    actualStart: null,
    createdAt: '2026-05-01T08:00:00.000Z',
    plannedEnd: dates.plannedEnd ?? null,
    plannedStart: dates.plannedStart ?? null,
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
