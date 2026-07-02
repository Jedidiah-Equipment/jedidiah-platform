import type { BaySchedule, DateOnlyIso, ProjectedJobSlot } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { bayWorkingCalendars, previewBayScheduleSeedInserts, projectBaySchedule } from './bay-schedule-projection.js';

function work(id: string, sequence: number, durationDays: number): ProjectedJobSlot {
  return {
    bayId: 'bay-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    durationDays,
    endDate: '2026-01-01',
    id,
    jobCode: `JOB-${id}`,
    jobId: `job-${id}`,
    kind: 'work',
    label: null,
    sequence,
    startDate: '2026-01-01',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as ProjectedJobSlot;
}

function bay({
  nextAvailableDate,
  scheduleOrigin,
  slots,
}: {
  nextAvailableDate: string;
  scheduleOrigin: string;
  slots: ProjectedJobSlot[];
}): BaySchedule {
  return {
    calendarExceptions: [],
    currentOperator: null,
    department: 'fabrication',
    disabledAt: null,
    id: 'bay-1',
    name: 'Bay 1',
    nextAvailableDate,
    scheduleOrigin,
    slots,
  } as unknown as BaySchedule;
}

const TODAY = '2026-06-14' as DateOnlyIso;

describe('bayWorkingCalendars', () => {
  it('merges org Off-Days with each Bay’s exceptions, sharing the org set', () => {
    const calendars = bayWorkingCalendars(
      [
        { calendarExceptions: [{ date: '2026-06-20', direction: 'off' }], id: 'bay-1' },
        { calendarExceptions: [], id: 'bay-2' },
      ],
      [{ date: '2026-06-16' }],
    );

    expect(calendars.get('bay-1')?.orgOffDays?.has('2026-06-16')).toBe(true);
    expect(calendars.get('bay-1')?.bayExceptions?.get('2026-06-20')).toBe('off');
    expect(calendars.get('bay-2')?.orgOffDays?.has('2026-06-16')).toBe(true);
    expect(calendars.get('bay-2')?.bayExceptions?.size).toBe(0);
  });
});

describe('projectBaySchedule', () => {
  it('stretches a slot across an org Off-Day', () => {
    const projection = projectBaySchedule({
      offDays: [{ date: '2026-06-16' }],
      scheduleOrigin: '2026-06-15' as DateOnlyIso,
      slots: [work('a', 1, 2)],
    });

    // 06-15 works, 06-16 is off (stepped over), 06-17 works -> ends 06-18.
    expect(projection.slots[0]?.endDate).toBe('2026-06-18');
    expect(projection.nextAvailableDate).toBe('2026-06-18');
  });
});

describe('previewBayScheduleSeedInserts', () => {
  it('appends a date-less seed as a trailing ghost', () => {
    const source = bay({ nextAvailableDate: '2026-06-18', scheduleOrigin: '2026-06-15', slots: [work('a', 1, 3)] });

    const result = previewBayScheduleSeedInserts(source, [], {
      seeds: [{ durationDays: 2, startDate: '' }],
      today: TODAY,
    });

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.splitOf).toBeUndefined();
    expect(result.ghosts).toEqual([
      { durationDays: 2, endDate: '2026-06-20', placementType: 'append', seedIndex: 0, startDate: '2026-06-18' },
    ]);
    expect(result.placements[0]?.type).toBe('append');
  });

  it('splits a target slot into before/after halves around the ghost', () => {
    const source = bay({ nextAvailableDate: '2026-06-20', scheduleOrigin: '2026-06-15', slots: [work('a', 1, 5)] });

    const result = previewBayScheduleSeedInserts(source, [], {
      seeds: [{ durationDays: 2, startDate: '2026-06-17' }],
      today: TODAY,
    });

    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]).toMatchObject({ durationDays: 2, splitOf: { half: 'before', sourceSlotId: 'a' } });
    expect(result.slots[1]).toMatchObject({ durationDays: 3, splitOf: { half: 'after', sourceSlotId: 'a' } });
    expect(result.ghosts[0]).toMatchObject({ placementType: 'split', seedIndex: 0, startDate: '2026-06-17' });
  });

  it('resolves a second same-Bay seed against the correct split half', () => {
    // Split a slot, then drop another seed inside the after half. With colliding half ids the second
    // seed would target the wrong half; unique half ids keep it on the after half (durations 2+3+5=10).
    const source = bay({ nextAvailableDate: '2026-06-25', scheduleOrigin: '2026-06-15', slots: [work('a', 1, 10)] });

    const result = previewBayScheduleSeedInserts(source, [], {
      seeds: [
        { durationDays: 2, startDate: '2026-06-17' },
        { durationDays: 1, startDate: '2026-06-22' },
      ],
      today: TODAY,
    });

    expect(result.ghosts.map((ghost) => ghost.placementType)).toEqual(['split', 'split']);
    expect(result.slots.map((slot) => slot.durationDays)).toEqual([2, 3, 5]);
    expect(result.slots.map((slot) => slot.splitOf?.sourceSlotId)).toEqual(['a', 'a:after', 'a:after']);
  });

  it('degrades a split landing inside an earlier seed ghost to insert-before', () => {
    // Seed 0 appends a 3-day ghost; seed 1 picks a date strictly inside it. A ghost has no stored Slot
    // to halve, so both the placement and the ghost resolve to insert-before, never a ghost split.
    const source = bay({ nextAvailableDate: '2026-06-15', scheduleOrigin: '2026-06-15', slots: [] });

    const result = previewBayScheduleSeedInserts(source, [], {
      seeds: [
        { durationDays: 3, startDate: '' },
        { durationDays: 1, startDate: '2026-06-16' },
      ],
      today: TODAY,
    });

    const seed1Ghost = result.ghosts.find((ghost) => ghost.seedIndex === 1);
    expect(result.placements[1]).toMatchObject({
      seedIndex: 0,
      // The start is where the new ghost lands (the target ghost's boundary), not the discarded pick.
      startDate: '2026-06-15',
      targetKind: 'ghost',
      type: 'insert-before',
    });
    expect(result.placements[1]).not.toHaveProperty('beforeDays');
    expect(seed1Ghost?.placementType).toBe('insert-before');
    // The reported placement start matches where the ghost actually renders in the overlay.
    expect(result.placements[1]?.startDate).toBe(seed1Ghost?.startDate);
  });

  it('clamps a trailing append forward when the queue ended in the past', () => {
    const source = bay({ nextAvailableDate: '2026-06-03', scheduleOrigin: '2026-06-01', slots: [work('a', 1, 2)] });

    const result = previewBayScheduleSeedInserts(source, [], {
      seeds: [{ durationDays: 2, startDate: '' }],
      today: TODAY,
    });

    // Without the clamp the ghost would start at the stale queue end (06-03); it clamps to today.
    expect(result.ghosts[0]?.startDate).toBe('2026-06-14');
    expect(result.ghosts[0]?.endDate).toBe('2026-06-16');
  });

  it('ignores seeds with a non-positive or non-integer duration', () => {
    const source = bay({ nextAvailableDate: '2026-06-18', scheduleOrigin: '2026-06-15', slots: [work('a', 1, 3)] });

    const result = previewBayScheduleSeedInserts(source, [], {
      seeds: [{ durationDays: 0, startDate: '' }],
      today: TODAY,
    });

    expect(result.changed).toBe(false);
    expect(result.ghosts).toHaveLength(0);
  });
});
