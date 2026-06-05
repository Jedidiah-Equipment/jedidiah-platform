import { startOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { addJobSlotDuration, DEFAULT_IDLE_SLOT_LABEL, projectJobSlots } from './job-slot-projection.js';

const scheduleOrigin = new Date('2026-06-05T08:00:00.000Z');
const scheduleOriginDayStart = startOfDay(scheduleOrigin);

describe('projectJobSlots', () => {
  it('reports the schedule origin as next available for an empty bay', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [],
    });

    expect(projection.slots).toEqual([]);
    expect(projection.nextAvailableAt).toEqual(scheduleOriginDayStart);
  });

  it('projects appended slots sequentially from the schedule origin day start', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [
        slot({ id: 'slot-2', sequence: 2, durationDays: 2 }),
        slot({ id: 'slot-1', sequence: 1, durationDays: 1 }),
      ],
    });

    expect(projection.slots.map(({ id, startAt, endAt }) => ({ id, startAt, endAt }))).toEqual([
      {
        id: 'slot-1',
        startAt: scheduleOriginDayStart,
        endAt: addJobSlotDuration(scheduleOriginDayStart, 1),
      },
      {
        id: 'slot-2',
        startAt: addJobSlotDuration(scheduleOriginDayStart, 1),
        endAt: addJobSlotDuration(scheduleOriginDayStart, 3),
      },
    ]);
    expect(projection.nextAvailableAt).toEqual(addJobSlotDuration(scheduleOriginDayStart, 3));
  });

  it('projects mixed work and idle slots as one contiguous queue', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [
        slot({ id: 'slot-a', jobStageId: 'stage-1', kind: 'work', sequence: 1 }),
        slot({ id: 'slot-b', kind: 'idle', label: null, sequence: 2 }),
        slot({ id: 'slot-c', jobStageId: 'stage-1', kind: 'work', sequence: 3 }),
      ],
    });

    expect(projection.slots.map(({ id, kind, startAt }) => ({ id, kind, startAt }))).toEqual([
      { id: 'slot-a', kind: 'work', startAt: scheduleOriginDayStart },
      { id: 'slot-b', kind: 'idle', startAt: addJobSlotDuration(scheduleOriginDayStart, 1) },
      { id: 'slot-c', kind: 'work', startAt: addJobSlotDuration(scheduleOriginDayStart, 2) },
    ]);
  });

  it('does not silently floor stale queues to today', () => {
    const staleOrigin = new Date('2026-06-01T08:00:00.000Z');
    const expectedStartAt = startOfDay(staleOrigin);
    const expectedEndAt = addJobSlotDuration(expectedStartAt, 1);
    const emptyProjection = projectJobSlots({
      scheduleOrigin: staleOrigin,
      slots: [],
    });
    const projection = projectJobSlots({
      scheduleOrigin: staleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1 })],
    });

    expect(emptyProjection).toEqual({
      nextAvailableAt: expectedStartAt,
      slots: [],
    });
    expect(projection.slots[0]).toMatchObject({
      id: 'slot-1',
      startAt: expectedStartAt,
      endAt: expectedEndAt,
    });
    expect(projection.nextAvailableAt).toEqual(expectedEndAt);
  });

  it('adds slot durations as whole calendar days', () => {
    const startAt = new Date('2026-06-05T00:00:00.000Z');

    expect(addJobSlotDuration(startAt, 4)).toEqual(new Date('2026-06-09T00:00:00.000Z'));
    expect(addJobSlotDuration(startAt, 6)).toEqual(new Date('2026-06-11T00:00:00.000Z'));
  });

  it('exposes the default idle slot label', () => {
    expect(DEFAULT_IDLE_SLOT_LABEL).toBe('Idle');
  });
});

function slot(input: {
  durationDays?: number;
  id: string;
  jobStageId?: string | null;
  kind?: 'work' | 'idle';
  label?: string | null;
  sequence: number;
}) {
  const kind = input.kind ?? 'work';
  return {
    durationDays: input.durationDays ?? 1,
    id: input.id,
    jobStageId: kind === 'work' ? (input.jobStageId ?? 'stage-1') : null,
    kind,
    label: kind === 'idle' ? (input.label ?? null) : null,
    sequence: input.sequence,
  };
}
