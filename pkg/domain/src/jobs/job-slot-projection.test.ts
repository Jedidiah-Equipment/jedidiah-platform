import { describe, expect, it } from 'vitest';

import { projectJobSlots } from './job-slot-projection.js';

const scheduleOrigin = new Date('2026-06-05T08:00:00.000Z');

describe('projectJobSlots', () => {
  it('reports the schedule origin as next available for an empty bay', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [],
    });

    expect(projection.slots).toEqual([]);
    expect(projection.nextAvailableAt).toEqual(scheduleOrigin);
  });

  it('projects appended slots sequentially from the schedule origin', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [
        slot({ id: 'slot-2', sequence: 2, durationMinutes: 960 }),
        slot({ id: 'slot-1', sequence: 1, durationMinutes: 480 }),
      ],
    });

    expect(projection.slots.map(({ id, startAt, endAt }) => ({ id, startAt, endAt }))).toEqual([
      {
        id: 'slot-1',
        startAt: new Date('2026-06-05T08:00:00.000Z'),
        endAt: new Date('2026-06-05T16:00:00.000Z'),
      },
      {
        id: 'slot-2',
        startAt: new Date('2026-06-05T16:00:00.000Z'),
        endAt: new Date('2026-06-06T08:00:00.000Z'),
      },
    ]);
    expect(projection.nextAvailableAt).toEqual(new Date('2026-06-06T08:00:00.000Z'));
  });

  it('projects multiple slots for the same job stage as separate queue entries', () => {
    const projection = projectJobSlots({
      scheduleOrigin,
      slots: [
        slot({ id: 'slot-a', jobStageId: 'stage-1', sequence: 1 }),
        slot({ id: 'slot-b', jobStageId: 'stage-2', sequence: 2 }),
        slot({ id: 'slot-c', jobStageId: 'stage-1', sequence: 3 }),
      ],
    });

    expect(projection.slots.map(({ id, jobStageId, startAt }) => ({ id, jobStageId, startAt }))).toEqual([
      { id: 'slot-a', jobStageId: 'stage-1', startAt: new Date('2026-06-05T08:00:00.000Z') },
      { id: 'slot-b', jobStageId: 'stage-2', startAt: new Date('2026-06-05T16:00:00.000Z') },
      { id: 'slot-c', jobStageId: 'stage-1', startAt: new Date('2026-06-06T00:00:00.000Z') },
    ]);
  });
});

function slot(input: { durationMinutes?: number; id: string; jobStageId?: string; sequence: number }) {
  return {
    durationMinutes: input.durationMinutes ?? 480,
    id: input.id,
    jobStageId: input.jobStageId ?? 'stage-1',
    sequence: input.sequence,
  };
}
