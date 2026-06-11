import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  addJobSlotDuration,
  countWorkingDaysBetween,
  DEFAULT_IDLE_SLOT_LABEL,
  projectJobSlots,
  segmentSlotCalendarDays,
  summarizeSlotCalendarDays,
} from './job-slot-projection.js';

const day = (value: string) => DateOnlyIso.parse(value);
const scheduleOrigin = day('2026-06-05');

describe('projectJobSlots', () => {
  it('reports the schedule origin as next available for an empty bay', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [],
    });

    expect(projection.slots).toEqual([]);
    expect(projection.nextAvailableDate).toBe(scheduleOrigin);
  });

  it('projects appended slots sequentially from the schedule origin business date', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [
        slot({ id: 'slot-2', sequence: 2, durationDays: 2 }),
        slot({ id: 'slot-1', sequence: 1, durationDays: 1 }),
      ],
    });

    expect(projection.slots.map(({ id, startDate, endDate }) => ({ id, startDate, endDate }))).toEqual([
      {
        id: 'slot-1',
        startDate: '2026-06-05',
        endDate: '2026-06-06',
      },
      {
        id: 'slot-2',
        startDate: '2026-06-06',
        endDate: '2026-06-08',
      },
    ]);
    expect(projection.nextAvailableDate).toBe('2026-06-08');
  });

  it('projects mixed work and idle slots as one contiguous queue', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [
        slot({ id: 'slot-a', jobId: 'job-1', kind: 'work', sequence: 1 }),
        slot({ id: 'slot-b', kind: 'idle', label: null, sequence: 2 }),
        slot({ id: 'slot-c', jobId: 'job-1', kind: 'work', sequence: 3 }),
      ],
    });

    expect(projection.slots.map(({ id, kind, startDate }) => ({ id, kind, startDate }))).toEqual([
      { id: 'slot-a', kind: 'work', startDate: '2026-06-05' },
      { id: 'slot-b', kind: 'idle', startDate: '2026-06-06' },
      { id: 'slot-c', kind: 'work', startDate: '2026-06-07' },
    ]);
  });

  it('does not silently floor stale queues to today', () => {
    const staleOrigin = day('2026-06-01');
    const emptyProjection = projectJobSlots({
      scheduleOrigin: staleOrigin,
      slots: [],
    });
    const projection = projectJobSlots({
      scheduleOrigin: staleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1 })],
    });

    expect(emptyProjection).toEqual({
      nextAvailableDate: '2026-06-01',
      slots: [],
    });
    expect(projection.slots[0]).toMatchObject({
      id: 'slot-1',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
    });
    expect(projection.nextAvailableDate).toBe('2026-06-02');
  });

  it('adds slot durations as working days with an empty calendar', () => {
    expect(addJobSlotDuration(day('2026-06-05'), 4)).toBe('2026-06-09');
    expect(addJobSlotDuration(day('2026-06-05'), 6)).toBe('2026-06-11');
    expect(addJobSlotDuration(day('2026-06-28'), 4)).toBe('2026-07-02');
  });

  it('projects slot durations as working days across org off-days', () => {
    const projection = projectJobSlots({
      scheduleOrigin: day('2026-06-04'),
      slots: [slot({ durationDays: 5, id: 'slot-1', sequence: 1 })],
      workingCalendar: {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      },
    });

    expect(projection.slots[0]).toMatchObject({
      id: 'slot-1',
      startDate: '2026-06-04',
      endDate: '2026-06-11',
    });
    expect(projection.nextAvailableDate).toBe('2026-06-11');
  });

  it('keeps queued slots contiguous when a previous slot ends on an off-day', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [
        slot({ durationDays: 1, id: 'slot-1', sequence: 1 }),
        slot({ durationDays: 3, id: 'slot-2', sequence: 2 }),
      ],
      workingCalendar: {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      },
    });

    expect(projection.slots.map(({ id, startDate, endDate }) => ({ id, startDate, endDate }))).toEqual([
      {
        id: 'slot-1',
        startDate: '2026-06-05',
        endDate: '2026-06-06',
      },
      {
        id: 'slot-2',
        startDate: '2026-06-06',
        endDate: '2026-06-11',
      },
    ]);
    expect(projection.nextAvailableDate).toBe('2026-06-11');
  });

  it('starts the first slot at the schedule origin when the origin is an off-day', () => {
    const projection = projectJobSlots({
      scheduleOrigin: day('2026-06-06'),
      slots: [slot({ id: 'slot-1', sequence: 1 })],
      workingCalendar: {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      },
    });

    expect(projection.slots[0]).toMatchObject({
      id: 'slot-1',
      startDate: '2026-06-06',
      endDate: '2026-06-09',
    });
    expect(projection.nextAvailableDate).toBe('2026-06-09');
  });

  it('lets a bay work exception open an org off-day', () => {
    const projection = projectJobSlots({
      scheduleOrigin: day('2026-06-05'),
      slots: [slot({ durationDays: 3, id: 'slot-1', sequence: 1 })],
      workingCalendar: {
        bayExceptions: new Map([['2026-06-06', 'work']]),
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      },
    });

    expect(projection.slots[0]).toMatchObject({
      id: 'slot-1',
      startDate: '2026-06-05',
      endDate: '2026-06-09',
    });
  });

  it('lets a bay off exception close an otherwise-working day', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [slot({ durationDays: 2, id: 'slot-1', sequence: 1 })],
      workingCalendar: {
        bayExceptions: new Map([['2026-06-06', 'off']]),
      },
    });

    expect(projection.slots[0]).toMatchObject({
      id: 'slot-1',
      startDate: '2026-06-05',
      endDate: '2026-06-08',
    });
  });

  it('counts idle slot durations in working days', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [
        slot({ id: 'slot-a', kind: 'work', sequence: 1 }),
        slot({ durationDays: 2, id: 'slot-b', kind: 'idle', sequence: 2 }),
        slot({ id: 'slot-c', kind: 'work', sequence: 3 }),
      ],
      workingCalendar: {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      },
    });

    expect(projection.slots.map(({ id, startDate, endDate }) => ({ id, startDate, endDate }))).toEqual([
      {
        id: 'slot-a',
        startDate: '2026-06-05',
        endDate: '2026-06-06',
      },
      {
        id: 'slot-b',
        startDate: '2026-06-06',
        endDate: '2026-06-10',
      },
      {
        id: 'slot-c',
        startDate: '2026-06-10',
        endDate: '2026-06-11',
      },
    ]);
  });

  it('counts working days between two dates', () => {
    expect(
      countWorkingDaysBetween(day('2026-06-05'), day('2026-06-10'), {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toBe(3);
    expect(
      countWorkingDaysBetween(day('2026-06-05'), day('2026-06-10'), {
        bayExceptions: new Map([
          ['2026-06-06', 'work'],
          ['2026-06-09', 'off'],
        ]),
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toBe(3);
  });

  it('exposes the default idle slot label', () => {
    expect(DEFAULT_IDLE_SLOT_LABEL).toBe('Idle');
  });
});

describe('summarizeSlotCalendarDays', () => {
  it('counts every day as working with an empty calendar', () => {
    expect(summarizeSlotCalendarDays(day('2026-06-05'), day('2026-06-09'))).toEqual({
      workingDays: 4,
      closureDays: 0,
      overtimeDays: 0,
    });
  });

  it('counts org off-days inside the span as closures', () => {
    // 5 working days projected across two org off-days (the projected span from job-slot tests).
    expect(
      summarizeSlotCalendarDays(day('2026-06-04'), day('2026-06-11'), {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toEqual({ workingDays: 5, closureDays: 2, overtimeDays: 0 });
  });

  it('counts a bay work exception on an org off-day as overtime', () => {
    // 3 working days with 2026-06-06 opened as overtime and 2026-06-07 still closed.
    expect(
      summarizeSlotCalendarDays(day('2026-06-05'), day('2026-06-09'), {
        bayExceptions: new Map([['2026-06-06', 'work']]),
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toEqual({ workingDays: 3, closureDays: 1, overtimeDays: 1 });
  });

  it('counts a bay off exception inside the span as a closure', () => {
    // 2 working days with 2026-06-06 closed by a bay exception.
    expect(
      summarizeSlotCalendarDays(day('2026-06-05'), day('2026-06-08'), {
        bayExceptions: new Map([['2026-06-06', 'off']]),
      }),
    ).toEqual({ workingDays: 2, closureDays: 1, overtimeDays: 0 });
  });
});

describe('segmentSlotCalendarDays', () => {
  it('returns a single working segment with an empty calendar', () => {
    expect(segmentSlotCalendarDays(day('2026-06-05'), day('2026-06-09'))).toEqual([
      { kind: 'working', startDate: '2026-06-05', endDate: '2026-06-09' },
    ]);
  });

  it('merges consecutive org off-days into one closure segment', () => {
    expect(
      segmentSlotCalendarDays(day('2026-06-04'), day('2026-06-11'), {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toEqual([
      { kind: 'working', startDate: '2026-06-04', endDate: '2026-06-06' },
      { kind: 'closure', startDate: '2026-06-06', endDate: '2026-06-08' },
      { kind: 'working', startDate: '2026-06-08', endDate: '2026-06-11' },
    ]);
  });

  it('classifies a bay work exception on an org off-day as overtime', () => {
    expect(
      segmentSlotCalendarDays(day('2026-06-05'), day('2026-06-09'), {
        bayExceptions: new Map([['2026-06-06', 'work']]),
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toEqual([
      { kind: 'working', startDate: '2026-06-05', endDate: '2026-06-06' },
      { kind: 'overtime', startDate: '2026-06-06', endDate: '2026-06-07' },
      { kind: 'closure', startDate: '2026-06-07', endDate: '2026-06-08' },
      { kind: 'working', startDate: '2026-06-08', endDate: '2026-06-09' },
    ]);
  });
});

function slot(input: {
  durationDays?: number;
  id: string;
  jobId?: string | null;
  kind?: 'work' | 'idle';
  label?: string | null;
  sequence: number;
}) {
  const kind = input.kind ?? 'work';
  return {
    durationDays: input.durationDays ?? 1,
    id: input.id,
    jobId: kind === 'work' ? (input.jobId ?? 'job-1') : null,
    kind,
    label: kind === 'idle' ? (input.label ?? null) : null,
    sequence: input.sequence,
  };
}
