import { rollupJobSchedule, rollupStageSchedule, type ScheduleRollupWindow } from '@pkg/domain';
import type { JobStageName, JobSummary, StationBooking } from '@pkg/schema';
import { JobCode, JobDetail } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  addReadOnlyJobsToScheduleGanttRows,
  buildScheduleGanttGlobalRows,
  buildScheduleGanttReadOnlyStationBooking,
  buildScheduleGanttRows,
  formatScheduleDateTimeInputValue,
  getActualEndForDisplay,
  getScheduleGanttActualDateEdits,
  getScheduleGanttActualDisplay,
  getScheduleGanttActualRangeAfterDrag,
  getScheduleGanttBarLabel,
  getScheduleGanttHoverCardModel,
  getScheduleGanttPlannedDateEdits,
  getScheduleGanttPlannedDisplay,
  getScheduleGanttPlannedRangeAfterDrag,
  getScheduleGanttTimelineDayCount,
  packScheduleGanttStationLanes,
  parseScheduleDate,
  parseScheduleDateTimeInputValue,
  resolveScheduleDateTimeInputValue,
  type ScheduleGanttRow,
  type ScheduleGanttStationBooking,
} from './schedule-gantt-helpers.js';

describe('buildScheduleGanttRows', () => {
  it('keeps the Job and every Department stage on the chart with nested station bookings', () => {
    const job = createJobDetail();

    expect(buildScheduleGanttRows(job)).toEqual([
      expect.objectContaining({
        id: 'job-summary',
        level: 'stage',
        parentId: null,
        stationBookings: [
          expect.objectContaining({
            barKind: 'job',
            laneIndex: 0,
            readOnly: true,
            title: 'JOB-00001',
          }),
        ],
        title: 'Job',
      }),
      expect.objectContaining({
        id: `stage-${stageIds.procurement}`,
        level: 'stage',
        parentId: null,
        stationBookings: [
          expect.objectContaining({
            plannedEnd: '2026-05-03',
            plannedStart: '2026-05-01',
            id: `station-${bookingIds['procurement-1']}`,
            level: 'station',
            parentId: `stage-${stageIds.procurement}`,
            stage: 'procurement',
            title: 'Procurement Desk',
          }),
        ],
        title: 'Procurement',
      }),
      expect.objectContaining({ id: `stage-${stageIds.supply}`, level: 'stage', parentId: null, title: 'Supply' }),
      expect.objectContaining({
        id: `stage-${stageIds.fabrication}`,
        level: 'stage',
        parentId: null,
        stationBookings: [
          expect.objectContaining({
            actualEnd: null,
            actualStart: null,
            plannedEnd: null,
            plannedStart: null,
            id: `station-${bookingIds['fabrication-1']}`,
            level: 'station',
            parentId: `stage-${stageIds.fabrication}`,
            stage: 'fabrication',
            title: 'Weld Bay',
          }),
        ],
        title: 'Fabrication',
      }),
      expect.objectContaining({ id: `stage-${stageIds.paint}`, level: 'stage', parentId: null, title: 'Paint' }),
      expect.objectContaining({ id: `stage-${stageIds.assembly}`, level: 'stage', parentId: null, title: 'Assembly' }),
    ]);
  });

  it('does not emit standalone station rows', () => {
    expect(buildScheduleGanttRows(createJobDetail()).map((row) => row.level)).toEqual([
      'stage',
      'stage',
      'stage',
      'stage',
      'stage',
      'stage',
    ]);
  });

  it('orders station lanes by station display order instead of schedule dates', () => {
    const job = createJobDetail({
      fabricationStations: [
        createStationBooking('fabrication-2', 'Weld Bay 2', {
          displayOrder: 2,
          plannedEnd: '2026-05-01',
          plannedStart: '2026-05-01',
        }),
        createStationBooking('fabrication-1', 'Weld Bay 1', {
          displayOrder: 1,
          plannedEnd: '2026-05-10',
          plannedStart: '2026-05-10',
        }),
      ],
    });

    expect(
      buildScheduleGanttRows(job)
        .find((row) => row.title === 'Fabrication')
        ?.stationBookings.map((stationBooking) => stationBooking.title),
    ).toEqual(['Weld Bay 1', 'Weld Bay 2']);
  });

  it('maps shared-station bookings into gray overlay hover rows', () => {
    const job = createSharedStationBookingJob();
    const booking = job.stages.flatMap((stage) => stage.stations).at(0) ?? raise('Expected shared booking.');
    const row = buildScheduleGanttReadOnlyStationBooking({
      booking,
      job,
      parentId: 'stage-fabrication',
    });

    expect(row).toMatchObject({
      actualEnd: null,
      actualStart: '2026-05-02T08:00:00.000Z',
      plannedEnd: '2026-05-05',
      plannedStart: '2026-05-01',
      level: 'station',
      stage: 'fabrication',
      stationId: stationIds['fabrication-1'],
      statusLabel: 'Active',
      title: 'JOB-00002',
    });
    expect(getScheduleGanttHoverCardModel(row, new Date('2026-05-03T08:00:00.000Z'))).toMatchObject({
      contextLabel: 'Fabrication station',
      workflowStatusLabel: 'Active',
      title: 'JOB-00002',
    });
  });

  it('adds fetched jobs to draft rows as read-only job and matching station bars', () => {
    const rows = addReadOnlyJobsToScheduleGanttRows(
      [
        {
          actualEnd: null,
          actualStart: null,
          plannedEnd: '2026-05-03',
          plannedStart: '2026-05-01',
          entityId: 'create-job',
          id: 'create-job',
          level: 'stage',
          parentId: null,
          stationId: null,
          stationBookings: [
            createScheduleStationBooking({
              barKind: 'job',
              id: 'create-job-summary',
              parentId: 'create-job',
              stationId: 'create-job',
              title: 'Draft Job',
            }),
          ],
          statusLabel: 'Draft',
          title: 'Draft Job',
        },
        {
          actualEnd: null,
          actualStart: null,
          plannedEnd: '2026-05-03',
          plannedStart: '2026-05-01',
          entityId: 'fabrication',
          id: 'create-stage-fabrication',
          level: 'stage',
          parentId: null,
          stationId: null,
          stationBookings: [
            createScheduleStationBooking({
              entityId: 'draft-booking',
              id: 'create-station-draft-booking',
              parentId: 'create-stage-fabrication',
            }),
          ],
          statusLabel: 'Draft',
          title: 'Fabrication',
        },
      ],
      [createSharedStationBookingJob()],
    );

    expect(rows[0]?.stationBookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          barKind: 'job',
          readOnly: true,
          title: 'JOB-00002',
        }),
      ]),
    );
    expect(rows[1]?.stationBookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          readOnly: true,
          stationId: stationIds['fabrication-1'],
          title: 'JOB-00002',
        }),
      ]),
    );
  });

  it('maps global schedule bookings into station rows grouped by department', () => {
    const rows = buildScheduleGanttGlobalRows([
      createSharedStationBookingJob({
        bookingId: '00000000-0000-4000-8000-000000000402',
        jobCode: 'JOB-00004',
        jobId: '00000000-0000-4000-8000-000000000404',
        stage: 'paint',
        stationId: '00000000-0000-4000-8000-000000000502',
        stationName: 'Paint Booth',
      }),
      createSharedStationBookingJob({
        bookingId: '00000000-0000-4000-8000-000000000401',
        jobCode: 'JOB-00003',
        jobId: '00000000-0000-4000-8000-000000000403',
        stage: 'fabrication',
        stationId: stationIds['fabrication-1'],
        stationName: 'Weld Bay',
      }),
    ]);

    expect(rows.map((row) => row.title)).toEqual(['Jobs', 'Weld Bay', 'Paint Booth']);
    expect(rows[0]).toMatchObject({
      id: 'global-jobs',
      statusLabel: 'Job',
      stationBookings: expect.arrayContaining([
        expect.objectContaining({
          barKind: 'job',
          laneIndex: 0,
          readOnly: true,
          title: 'JOB-00003',
        }),
        expect.objectContaining({
          barKind: 'job',
          laneIndex: 0,
          readOnly: true,
          title: 'JOB-00004',
        }),
      ]),
    });
    expect(rows[1]).toMatchObject({
      id: `global-station-${stationIds['fabrication-1']}`,
      stationId: stationIds['fabrication-1'],
      statusLabel: 'Fabrication',
      stationBookings: [
        expect.objectContaining({
          level: 'station',
          parentId: `global-station-${stationIds['fabrication-1']}`,
          title: 'JOB-00003',
        }),
      ],
    });
  });

  it('packs global station bookings into the same lane unless their displayed ranges overlap', () => {
    const packed = packScheduleGanttStationLanes([
      createScheduleStationBooking({ id: 'overlap-a', plannedEnd: '2026-05-04', plannedStart: '2026-05-01' }),
      createScheduleStationBooking({ id: 'overlap-b', plannedEnd: '2026-05-05', plannedStart: '2026-05-03' }),
      createScheduleStationBooking({ id: 'later', plannedEnd: '2026-05-08', plannedStart: '2026-05-05' }),
    ]);

    expect(packed.map((booking) => [booking.id, booking.laneIndex])).toEqual([
      ['overlap-a', 0],
      ['overlap-b', 1],
      ['later', 0],
    ]);
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

  it('prefixes station booking bar labels with the station name', () => {
    const stationBooking = buildScheduleGanttRows(createJobDetail())
      .find((row) => row.title === 'Procurement')
      ?.stationBookings.at(0);

    if (!stationBooking) throw new Error('Expected a station booking.');

    expect(getScheduleGanttBarLabel(stationBooking, 'Planned May 1, 2026 to May 3, 2026')).toBe(
      'Procurement Desk: Planned May 1, 2026 to May 3, 2026',
    );
  });

  it('runs in-progress actuals through the supplied current timestamp', () => {
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
    expect(display.start).toEqual(new Date('2026-05-20T08:00:00.000Z'));
    expect(display.end).toEqual(now);
  });

  it('keeps completed actual timestamps at datetime precision', () => {
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
    expect(display.start).toEqual(new Date('2026-05-20T08:00:00.000Z'));
    expect(display.end).toEqual(new Date('2026-05-21T17:00:00.000Z'));
  });

  it('keeps future in-progress actuals anchored to their start', () => {
    expect(
      getActualEndForDisplay(new Date('2026-05-24T00:00:00.000Z'), null, new Date('2026-05-22T09:30:00.000Z')),
    ).toEqual(new Date('2026-05-24T00:00:00.000Z'));
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

  it('orders two station booking planned date edits so each intermediate range stays valid', () => {
    expect(
      getScheduleGanttPlannedDateEdits({
        entityId: ids.stationBooking,
        nextPlannedEnd: '2026-05-12',
        nextPlannedStart: '2026-05-10',
        previousPlannedEnd: '2026-05-03',
        previousPlannedStart: '2026-05-01',
      }).map((edit) => edit.field),
    ).toEqual(['planned_end', 'planned_start']);

    expect(
      getScheduleGanttPlannedDateEdits({
        entityId: ids.stationBooking,
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
        entityId: ids.stationBooking,
        nextActualEnd: '2026-05-23T12:00:00.000Z',
        nextActualStart: '2026-05-22T08:00:00.000Z',
        previousActualEnd: '2026-05-22T12:00:00.000Z',
        previousActualStart: '2026-05-22T08:00:00.000Z',
      }),
    ).toEqual([
      {
        entityId: ids.stationBooking,
        entityLevel: 'station-booking',
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
        entityId: ids.stationBooking,
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
        entityId: ids.stationBooking,
        nextActualEnd: null,
        nextActualStart: '2026-05-22T08:00:00.000Z',
        previousActualEnd: '2026-05-23T12:00:00.000Z',
        previousActualStart: '2026-05-22T08:00:00.000Z',
      }),
    ).toEqual([
      {
        entityId: ids.stationBooking,
        entityLevel: 'station-booking',
        field: 'actual_end',
        value: null,
      },
    ]);
  });

  it('orders actual datetime edits so each intermediate range stays valid', () => {
    expect(
      getScheduleGanttActualDateEdits({
        entityId: ids.stationBooking,
        nextActualEnd: '2026-05-23T12:00:00.000Z',
        nextActualStart: '2026-05-23T08:00:00.000Z',
        previousActualEnd: '2026-05-22T12:00:00.000Z',
        previousActualStart: '2026-05-22T08:00:00.000Z',
      }).map((edit) => edit.field),
    ).toEqual(['actual_end', 'actual_start']);
  });

  it('moves and resizes actual ranges by fractional-day datetime deltas', () => {
    expect(
      getScheduleGanttActualRangeAfterDrag({
        action: 'move',
        actualEnd: '2026-05-22T12:00:00.000Z',
        actualStart: '2026-05-20T08:00:00.000Z',
        millisecondDelta: 6 * 60 * 60 * 1000,
      }),
    ).toEqual({
      actualEnd: '2026-05-22T18:00:00.000Z',
      actualStart: '2026-05-20T14:00:00.000Z',
    });

    expect(
      getScheduleGanttActualRangeAfterDrag({
        action: 'resize-start',
        actualEnd: '2026-05-22T12:00:00.000Z',
        actualStart: '2026-05-20T08:00:00.000Z',
        millisecondDelta: 90 * 60 * 1000,
      }),
    ).toEqual({
      actualEnd: '2026-05-22T12:00:00.000Z',
      actualStart: '2026-05-20T09:30:00.000Z',
    });
  });

  it('builds station hover card context with planned and actual durations', () => {
    const stationBooking = buildScheduleGanttRows(
      createJobDetail({
        fabricationStations: [
          createStationBooking('fabrication-1', 'Weld Bay', {
            actualEnd: '2026-05-03T10:00:00.000Z',
            actualStart: '2026-05-01T08:00:00.000Z',
            plannedEnd: '2026-05-04',
            plannedStart: '2026-05-01',
          }),
        ],
      }),
    )
      .find((row) => row.title === 'Fabrication')
      ?.stationBookings.at(0);

    if (!stationBooking) throw new Error('Expected station booking.');

    expect(getScheduleGanttHoverCardModel(stationBooking, new Date('2026-05-04T12:00:00'))).toMatchObject({
      actualDurationLabel: '2 days 2 hours',
      actualRangeLabel: expect.stringMatching(/^May 1, \d{2}:\d{2} to May 3, \d{2}:\d{2}$/),
      contextLabel: 'Fabrication station',
      department: 'fabrication',
      plannedDurationLabel: '4 days',
      plannedRangeLabel: 'May 1 to May 4, 2026',
      scheduleHealth: 'On time',
      title: 'Weld Bay',
      varianceLabel: '1 day ahead',
      workflowStatusLabel: 'Pending',
    });
  });

  it('uses the supplied current timestamp for open actual hover card durations', () => {
    expect(
      getScheduleGanttHoverCardModel(
        createScheduleHoverRow({
          actualEnd: null,
          actualStart: '2026-05-01T08:00:00.000Z',
          plannedEnd: '2026-05-04',
          plannedStart: '2026-05-01',
        }),
        new Date('2026-05-03T14:00:00.000Z'),
      ),
    ).toMatchObject({
      actualDurationLabel: '2 days 6 hours',
      actualRangeLabel: expect.stringMatching(/^May 1, \d{2}:\d{2} to In progress$/),
      scheduleHealth: 'On track',
      varianceLabel: '1 day ahead',
    });
  });

  it.each([
    ['Unplanned', { plannedEnd: null, plannedStart: null }, '2026-05-03T12:00:00'],
    ['Not started', { actualStart: null }, '2026-05-03T12:00:00'],
    ['Overdue', { actualStart: null }, '2026-05-05T00:00:00'],
    ['On track', { actualEnd: null, actualStart: '2026-05-02T08:00:00' }, '2026-05-03T12:00:00'],
    ['Overdue', { actualEnd: null, actualStart: '2026-05-02T08:00:00' }, '2026-05-05T00:00:00'],
    ['On time', { actualEnd: '2026-05-04T12:00:00', actualStart: '2026-05-02T08:00:00' }, '2026-05-05T00:00:00'],
    ['Late', { actualEnd: '2026-05-05T08:00:00', actualStart: '2026-05-02T08:00:00' }, '2026-05-05T08:00:00'],
  ])('derives %s schedule health for hover cards', (scheduleHealth, overrides, now) => {
    expect(getScheduleGanttHoverCardModel(createScheduleHoverRow(overrides), new Date(now)).scheduleHealth).toBe(
      scheduleHealth,
    );
  });
});

function createScheduleHoverRow(overrides: Partial<ScheduleGanttRow> = {}): ScheduleGanttRow {
  return {
    actualEnd: null,
    actualStart: null,
    plannedEnd: '2026-05-04',
    plannedStart: '2026-05-01',
    entityId: ids.job,
    id: `job-${ids.job}`,
    level: 'job',
    parentId: null,
    stationId: null,
    stationBookings: [],
    statusLabel: 'Job',
    title: 'JOB-00001',
    ...overrides,
  };
}

function createJobDetail({
  fabricationStations = [createStationBooking('fabrication-1', 'Weld Bay')],
}: {
  fabricationStations?: StationBooking[];
} = {}): JobDetail {
  const stages = [
    createStage('procurement', 1, [
      createStationBooking('procurement-1', 'Procurement Desk', {
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
      }),
    ]),
    createStage('supply', 2),
    createStage('fabrication', 3, fabricationStations),
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
  id: 'fabrication-1' | 'fabrication-2' | 'procurement-1',
  name: string,
  dates: {
    actualEnd?: string | null;
    actualStart?: string | null;
    displayOrder?: number;
    plannedEnd?: string;
    plannedStart?: string;
  } = {},
): StationBooking {
  const stage = id.startsWith('procurement') ? 'procurement' : 'fabrication';

  return {
    actualEnd: dates.actualEnd ?? null,
    actualStart: dates.actualStart ?? null,
    createdAt: '2026-05-01T08:00:00.000Z',
    plannedEnd: dates.plannedEnd ?? null,
    plannedStart: dates.plannedStart ?? null,
    id: bookingIds[id],
    jobStageId: stageIds[stage],
    state: 'pending',
    station: {
      createdAt: '2026-05-01T08:00:00.000Z',
      department: stage,
      displayOrder: dates.displayOrder ?? 0,
      id: stationIds[id],
      isActive: true,
      name,
      updatedAt: '2026-05-01T08:00:00.000Z',
    },
    stationId: stationIds[id],
    updatedAt: '2026-05-01T08:00:00.000Z',
  };
}

function createScheduleStationBooking(
  overrides: Partial<ScheduleGanttStationBooking> = {},
): ScheduleGanttStationBooking {
  return {
    actualEnd: null,
    actualStart: null,
    plannedEnd: '2026-05-05',
    plannedStart: '2026-05-01',
    entityId: bookingIds['fabrication-1'],
    id: bookingIds['fabrication-1'],
    level: 'station',
    parentId: `stage-${stageIds.fabrication}`,
    stage: 'fabrication',
    stationId: stationIds['fabrication-1'],
    statusLabel: 'Pending',
    title: 'Weld Bay',
    ...overrides,
  };
}

function createSharedStationBookingJob({
  bookingId = bookingIds['fabrication-1'],
  jobCode = 'JOB-00002',
  jobId = '00000000-0000-4000-8000-000000000004',
  stage = 'fabrication',
  stationId = stationIds['fabrication-1'],
  stationName = 'Weld Bay',
}: {
  bookingId?: string;
  jobCode?: string;
  jobId?: string;
  stage?: JobStageName;
  stationId?: string;
  stationName?: string;
} = {}): JobSummary {
  const station = createStationBooking(stage === 'procurement' ? 'procurement-1' : 'fabrication-1', stationName, {
    actualStart: '2026-05-02T08:00:00.000Z',
    plannedEnd: '2026-05-05',
    plannedStart: '2026-05-01',
  });
  const job = createJobDetail({
    fabricationStations: stage === 'fabrication' ? [{ ...station, id: bookingId, stationId }] : [],
  });

  return JobDetail.parse({
    ...job,
    code: JobCode.parse(jobCode),
    id: jobId,
    productModelCode: 'MODEL-2',
    productName: 'Other Machine',
    stages: job.stages.map((jobStage) => ({
      ...jobStage,
      jobId,
      stations:
        jobStage.stage === stage
          ? [
              {
                ...station,
                id: bookingId,
                jobStageId: jobStage.id,
                station: {
                  ...station.station,
                  department: stage,
                  id: stationId,
                  name: stationName,
                },
                stationId,
              },
            ]
          : [],
    })),
  });
}

function raise(message: string): never {
  throw new Error(message);
}

const ids = {
  job: '00000000-0000-4000-8000-000000000001',
  product: '00000000-0000-4000-8000-000000000002',
  stationBooking: '00000000-0000-4000-8000-000000000003',
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
  'fabrication-2': '00000000-0000-4000-8000-000000000203',
} as const;

const stationIds = {
  'procurement-1': '00000000-0000-4000-8000-000000000301',
  'fabrication-1': '00000000-0000-4000-8000-000000000302',
  'fabrication-2': '00000000-0000-4000-8000-000000000303',
} as const;

function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
