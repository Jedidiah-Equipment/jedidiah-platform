import type { BaySchedule, UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { moveBaySlotForDisplay } from './bay-schedule-display-move.js';

const id = (value: string) => value as UUID;
const timestamp = '2026-06-01T00:00:00.000Z';

function createBaySchedule(): BaySchedule {
  return {
    calendarExceptions: [],
    createdAt: timestamp,
    department: 'fabrication',
    disabledAt: null,
    id: id('bay-1'),
    name: 'Fabrication Bay 1',
    nextAvailableDate: '2026-06-12',
    scheduleOrigin: '2026-06-08',
    slots: [
      {
        bayId: id('bay-1'),
        createdAt: timestamp,
        durationDays: 1,
        endDate: '2026-06-09',
        id: id('slot-a'),
        jobCode: 'JOB-00001',
        jobId: id('job-a'),
        kind: 'work',
        label: null,
        sequence: 1,
        startDate: '2026-06-08',
        updatedAt: timestamp,
      },
      {
        bayId: id('bay-1'),
        createdAt: timestamp,
        durationDays: 2,
        endDate: '2026-06-11',
        id: id('slot-b'),
        jobCode: 'JOB-00002',
        jobId: id('job-b'),
        kind: 'work',
        label: null,
        sequence: 2,
        startDate: '2026-06-09',
        updatedAt: timestamp,
      },
      {
        bayId: id('bay-1'),
        createdAt: timestamp,
        durationDays: 1,
        endDate: '2026-06-12',
        id: id('slot-c'),
        jobId: null,
        kind: 'idle',
        label: 'Paint cure',
        sequence: 3,
        startDate: '2026-06-11',
        updatedAt: timestamp,
      },
    ],
    updatedAt: timestamp,
  } as unknown as BaySchedule;
}

describe('moveBaySlotForDisplay', () => {
  it('moves a slot left and reprojects the visible queue', () => {
    const bay = createBaySchedule();
    const result = moveBaySlotForDisplay([bay], [], 'slot-b', 'left');

    expect(result).not.toBe(bay);
    expect(result[0]?.slots.map((slot) => slot.id)).toEqual(['slot-b', 'slot-a', 'slot-c']);
    expect(result[0]?.slots.map((slot) => slot.sequence)).toEqual([1, 2, 3]);
    expect(result[0]?.slots[0]?.startDate).toBe(bay.slots[0]?.startDate);
    expect(result[0]?.slots[1]?.startDate).not.toBe(bay.slots[1]?.startDate);
  });

  it('moves a slot right and reprojects the visible queue', () => {
    const bay = createBaySchedule();
    const result = moveBaySlotForDisplay([bay], [], 'slot-b', 'right');

    expect(result[0]?.slots.map((slot) => slot.id)).toEqual(['slot-a', 'slot-c', 'slot-b']);
    expect(result[0]?.slots.map((slot) => slot.sequence)).toEqual([1, 2, 3]);
    expect(result[0]?.nextAvailableDate).toBeDefined();
  });

  it('returns the original list for boundary moves', () => {
    const bays = [createBaySchedule()];

    expect(moveBaySlotForDisplay(bays, [], 'slot-a', 'left')).toBe(bays);
    expect(moveBaySlotForDisplay(bays, [], 'slot-c', 'right')).toBe(bays);
  });
});
