import { describe, expect, it } from 'vitest';

import {
  rollupJobSchedule,
  rollupStageSchedule,
  type ScheduleRollupBooking,
  scheduleRollup,
} from './schedule-rollup.js';

describe('scheduleRollup', () => {
  it('returns min-start and max-end windows for station bookings', () => {
    const result = scheduleRollup([
      booking({
        actualEnd: '2026-05-21T12:00:00.000Z',
        actualStart: '2026-05-21T08:00:00.000Z',
        plannedEnd: '2026-05-22T00:00:00.000Z',
        plannedStart: '2026-05-20T00:00:00.000Z',
      }),
      booking({
        actualEnd: '2026-05-22T10:00:00.000Z',
        actualStart: '2026-05-20T09:00:00.000Z',
        plannedEnd: '2026-05-23T00:00:00.000Z',
        plannedStart: '2026-05-19T00:00:00.000Z',
      }),
    ]);

    expect(toIso(result.actualWindow)).toEqual({
      end: '2026-05-22T10:00:00.000Z',
      start: '2026-05-20T09:00:00.000Z',
    });
    expect(toIso(result.plannedWindow)).toEqual({
      end: '2026-05-23T00:00:00.000Z',
      start: '2026-05-19T00:00:00.000Z',
    });
  });

  it('keeps a window end null until every booking in scope has an end', () => {
    const result = scheduleRollup([
      booking({
        actualEnd: '2026-05-21T12:00:00.000Z',
        actualStart: '2026-05-21T08:00:00.000Z',
        plannedEnd: '2026-05-22T00:00:00.000Z',
        plannedStart: '2026-05-20T00:00:00.000Z',
      }),
      booking({
        actualEnd: null,
        actualStart: '2026-05-20T09:00:00.000Z',
        plannedEnd: null,
        plannedStart: '2026-05-19T00:00:00.000Z',
      }),
    ]);

    expect(toIso(result.actualWindow)).toEqual({
      end: null,
      start: '2026-05-20T09:00:00.000Z',
    });
    expect(toIso(result.plannedWindow)).toEqual({
      end: null,
      start: '2026-05-19T00:00:00.000Z',
    });
  });

  it('returns null windows for empty input', () => {
    expect(scheduleRollup([])).toEqual({
      actualWindow: { end: null, start: null },
      plannedWindow: { end: null, start: null },
    });
  });
});

describe('rollupStageSchedule', () => {
  it('rolls up one stage from that stage bookings', () => {
    const result = rollupStageSchedule([
      booking({
        actualEnd: '2026-05-21T12:00:00.000Z',
        actualStart: '2026-05-21T08:00:00.000Z',
        plannedEnd: '2026-05-22T00:00:00.000Z',
        plannedStart: '2026-05-20T00:00:00.000Z',
      }),
    ]);

    expect(toIso(result.actualWindow)).toEqual({
      end: '2026-05-21T12:00:00.000Z',
      start: '2026-05-21T08:00:00.000Z',
    });
  });
});

describe('rollupJobSchedule', () => {
  it('flattens all stage bookings and ignores stages with zero bookings', () => {
    const result = rollupJobSchedule([
      { bookings: [] },
      {
        bookings: [
          booking({
            actualEnd: '2026-05-21T12:00:00.000Z',
            actualStart: '2026-05-21T08:00:00.000Z',
            plannedEnd: '2026-05-22T00:00:00.000Z',
            plannedStart: '2026-05-20T00:00:00.000Z',
          }),
        ],
      },
      {
        bookings: [
          booking({
            actualEnd: '2026-05-22T10:00:00.000Z',
            actualStart: '2026-05-20T09:00:00.000Z',
            plannedEnd: '2026-05-23T00:00:00.000Z',
            plannedStart: '2026-05-19T00:00:00.000Z',
          }),
        ],
      },
    ]);

    expect(toIso(result.actualWindow)).toEqual({
      end: '2026-05-22T10:00:00.000Z',
      start: '2026-05-20T09:00:00.000Z',
    });
    expect(toIso(result.plannedWindow)).toEqual({
      end: '2026-05-23T00:00:00.000Z',
      start: '2026-05-19T00:00:00.000Z',
    });
  });
});

function booking(input: {
  actualEnd: string | null;
  actualStart: string | null;
  plannedEnd: string | null;
  plannedStart: string | null;
}): ScheduleRollupBooking {
  return {
    actualEnd: toDate(input.actualEnd),
    actualStart: toDate(input.actualStart),
    plannedEnd: toDate(input.plannedEnd),
    plannedStart: toDate(input.plannedStart),
  };
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toIso(window: { end: Date | null; start: Date | null }) {
  return {
    end: window.end?.toISOString() ?? null,
    start: window.start?.toISOString() ?? null,
  };
}
