import type { BaySchedule, DateOnlyIso, Department, OffDay, ProjectedJobSlot, UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  type BayScheduleGhostSeed,
  deriveGhostBaySchedules,
  selectVisibleBaySchedules,
} from './bay-schedule-ghosts.js';

const id = (value: string) => value as UUID;
const day = (value: string) => value as DateOnlyIso;
const timestamp = '2026-06-01T00:00:00.000Z';
const today = day('2026-06-05');

function buildWorkSlot(
  bayId: UUID,
  input: {
    durationDays: number;
    endDate: string;
    id: string;
    jobCode: string;
    sequence: number;
    startDate: string;
  },
): ProjectedJobSlot {
  return {
    bayId,
    createdAt: timestamp,
    durationDays: input.durationDays,
    endDate: day(input.endDate),
    id: id(input.id),
    jobCode: input.jobCode,
    jobId: id(`job-${input.id}`),
    kind: 'work',
    label: null,
    sequence: input.sequence,
    startDate: day(input.startDate),
    updatedAt: timestamp,
  } as unknown as ProjectedJobSlot;
}

function buildIdleSlot(
  bayId: UUID,
  input: {
    durationDays: number;
    endDate: string;
    id: string;
    label: string;
    sequence: number;
    startDate: string;
  },
): ProjectedJobSlot {
  return {
    bayId,
    createdAt: timestamp,
    durationDays: input.durationDays,
    endDate: day(input.endDate),
    id: id(input.id),
    jobId: null,
    kind: 'idle',
    label: input.label,
    sequence: input.sequence,
    startDate: day(input.startDate),
    updatedAt: timestamp,
  } as unknown as ProjectedJobSlot;
}

function buildBay(input: {
  department?: Department;
  id: string;
  name?: string;
  nextAvailableDate: string;
  scheduleOrigin: string;
  slots: ProjectedJobSlot[];
}): BaySchedule {
  return {
    calendarExceptions: [],
    createdAt: timestamp,
    department: input.department ?? 'fabrication',
    disabledAt: null,
    id: id(input.id),
    name: input.name ?? `Bay ${input.id}`,
    nextAvailableDate: day(input.nextAvailableDate),
    scheduleOrigin: day(input.scheduleOrigin),
    slots: input.slots,
    updatedAt: timestamp,
  } as unknown as BaySchedule;
}

/** origin 06-02: JOB-A 4d (06-02→06-06), JOB-B 3d (06-06→06-09), JOB-C 1d (06-09→06-10). */
function buildBusyBay(): BaySchedule {
  const bayId = id('bay-1');

  return buildBay({
    id: 'bay-1',
    nextAvailableDate: '2026-06-10',
    scheduleOrigin: '2026-06-02',
    slots: [
      buildWorkSlot(bayId, {
        durationDays: 4,
        endDate: '2026-06-06',
        id: 'slot-a',
        jobCode: 'JOB-A',
        sequence: 1,
        startDate: '2026-06-02',
      }),
      buildWorkSlot(bayId, {
        durationDays: 3,
        endDate: '2026-06-09',
        id: 'slot-b',
        jobCode: 'JOB-B',
        sequence: 2,
        startDate: '2026-06-06',
      }),
      buildWorkSlot(bayId, {
        durationDays: 1,
        endDate: '2026-06-10',
        id: 'slot-c',
        jobCode: 'JOB-C',
        sequence: 3,
        startDate: '2026-06-09',
      }),
    ],
  });
}

const seed = (input: Partial<BayScheduleGhostSeed>): BayScheduleGhostSeed => ({
  bayId: id('bay-1'),
  durationDays: 2,
  startDate: '',
  ...input,
});

describe('deriveGhostBaySchedules', () => {
  it('appends a ghost at the queue end for a seed without a date and leaves other bays untouched', () => {
    const busyBay = buildBusyBay();
    const otherBay = buildBay({
      id: 'bay-2',
      nextAvailableDate: '2026-06-05',
      scheduleOrigin: '2026-06-05',
      slots: [],
    });
    const result = deriveGhostBaySchedules({
      bays: [busyBay, otherBay],
      offDays: [],
      seeds: [seed({})],
      today,
    });

    expect(result.ghosts).toEqual([
      {
        bayId: id('bay-1'),
        durationDays: 2,
        endDate: '2026-06-12',
        id: 'ghost:bay-1:0',
        placementType: 'append',
        seedIndex: 0,
        startDate: '2026-06-10',
      },
    ]);
    expect(result.bays[0]?.slots.map((slot) => [slot.id, slot.startDate, slot.endDate])).toEqual([
      ['slot-a', '2026-06-02', '2026-06-06'],
      ['slot-b', '2026-06-06', '2026-06-09'],
      ['slot-c', '2026-06-09', '2026-06-10'],
    ]);
    expect(result.bays[1]).toBe(otherBay);
  });

  it('clamps a picked date past the next available day to a plain append', () => {
    const result = deriveGhostBaySchedules({
      bays: [buildBusyBay()],
      offDays: [],
      seeds: [seed({ startDate: '2026-06-20' })],
      today,
    });

    expect(result.ghosts[0]).toMatchObject({
      placementType: 'append',
      startDate: '2026-06-10',
    });
  });

  it('starts an append ghost on plant today when the queue ended in the past', () => {
    const staleBay = buildBay({
      id: 'bay-1',
      nextAvailableDate: '2026-06-03',
      scheduleOrigin: '2026-06-02',
      slots: [
        buildWorkSlot(id('bay-1'), {
          durationDays: 1,
          endDate: '2026-06-03',
          id: 'slot-old',
          jobCode: 'JOB-OLD',
          sequence: 1,
          startDate: '2026-06-02',
        }),
      ],
    });
    const result = deriveGhostBaySchedules({ bays: [staleBay], offDays: [], seeds: [seed({})], today });

    expect(result.ghosts[0]).toMatchObject({
      endDate: '2026-06-07',
      placementType: 'append',
      startDate: '2026-06-05',
    });
  });

  it('inserts a ghost before a slot whose start matches the picked date and reflows downstream slots', () => {
    const result = deriveGhostBaySchedules({
      bays: [buildBusyBay()],
      offDays: [],
      seeds: [seed({ startDate: '2026-06-06' })],
      today,
    });

    expect(result.ghosts[0]).toMatchObject({
      endDate: '2026-06-08',
      placementType: 'insert-before',
      startDate: '2026-06-06',
    });
    expect(result.bays[0]?.slots.map((slot) => [slot.id, slot.startDate, slot.endDate])).toEqual([
      ['slot-a', '2026-06-02', '2026-06-06'],
      ['slot-b', '2026-06-08', '2026-06-11'],
      ['slot-c', '2026-06-11', '2026-06-12'],
    ]);
  });

  it('splits the slot a picked date lands inside into marked halves around the ghost', () => {
    const result = deriveGhostBaySchedules({
      bays: [buildBusyBay()],
      offDays: [],
      seeds: [seed({ startDate: '2026-06-07' })],
      today,
    });
    const slots = result.bays[0]?.slots ?? [];

    expect(result.ghosts[0]).toMatchObject({
      endDate: '2026-06-09',
      placementType: 'split',
      startDate: '2026-06-07',
    });
    expect(slots.map((slot) => [slot.id, slot.durationDays, slot.startDate, slot.endDate])).toEqual([
      ['slot-a', 4, '2026-06-02', '2026-06-06'],
      ['slot-b:before', 1, '2026-06-06', '2026-06-07'],
      ['slot-b:after', 2, '2026-06-09', '2026-06-11'],
      ['slot-c', 1, '2026-06-11', '2026-06-12'],
    ]);
    expect(slots.find((slot) => slot.id === 'slot-b:before')?.previewSplit).toEqual({
      half: 'before',
      sourceSlotId: 'slot-b',
    });
    expect(slots.find((slot) => slot.id === 'slot-b:after')?.previewSplit).toEqual({
      half: 'after',
      sourceSlotId: 'slot-b',
    });
    const beforeHalf = slots.find((slot) => slot.id === 'slot-b:before');
    const afterHalf = slots.find((slot) => slot.id === 'slot-b:after');
    expect((beforeHalf?.durationDays ?? 0) + (afterHalf?.durationDays ?? 0)).toBe(3);
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(slots.length);
  });

  it('stretches a ghost spanning an org off-day', () => {
    const emptyBay = buildBay({
      id: 'bay-1',
      nextAvailableDate: '2026-06-06',
      scheduleOrigin: '2026-06-06',
      slots: [],
    });
    const offDays = [{ date: day('2026-06-07'), label: 'Holiday' }] as OffDay[];
    const result = deriveGhostBaySchedules({ bays: [emptyBay], offDays, seeds: [seed({})], today });

    expect(result.ghosts[0]).toMatchObject({
      endDate: '2026-06-09',
      startDate: '2026-06-06',
    });
  });

  it('defers an append ghost past a labeled idle slot at the queue end', () => {
    const bayId = id('bay-1');
    const deferredBay = buildBay({
      id: 'bay-1',
      nextAvailableDate: '2026-06-08',
      scheduleOrigin: '2026-06-02',
      slots: [
        buildWorkSlot(bayId, {
          durationDays: 4,
          endDate: '2026-06-06',
          id: 'slot-a',
          jobCode: 'JOB-A',
          sequence: 1,
          startDate: '2026-06-02',
        }),
        buildIdleSlot(bayId, {
          durationDays: 2,
          endDate: '2026-06-08',
          id: 'slot-idle',
          label: 'Awaiting parts',
          sequence: 2,
          startDate: '2026-06-06',
        }),
      ],
    });
    const result = deriveGhostBaySchedules({
      bays: [deferredBay],
      offDays: [],
      seeds: [seed({ durationDays: 1 })],
      today,
    });

    expect(result.ghosts[0]).toMatchObject({
      endDate: '2026-06-09',
      placementType: 'append',
      startDate: '2026-06-08',
    });
  });

  it('skips rows with invalid durations or unknown bays', () => {
    const bays = [buildBusyBay()];
    const result = deriveGhostBaySchedules({
      bays,
      offDays: [],
      seeds: [
        seed({ durationDays: NaN }),
        seed({ durationDays: 0 }),
        seed({ durationDays: -1 }),
        seed({ durationDays: 1.5 }),
        seed({ bayId: id('bay-unknown') }),
      ],
      today,
    });

    expect(result.ghosts).toEqual([]);
    expect(result.bays[0]).toBe(bays[0]);
  });

  it('resolves two seeds on the same bay sequentially, the second seeing the first ghost', () => {
    const result = deriveGhostBaySchedules({
      bays: [buildBusyBay()],
      offDays: [],
      seeds: [seed({}), seed({ durationDays: 1 })],
      today,
    });

    expect(result.ghosts).toHaveLength(2);
    expect(result.ghosts[0]).toMatchObject({ endDate: '2026-06-12', seedIndex: 0, startDate: '2026-06-10' });
    expect(result.ghosts[1]).toMatchObject({ endDate: '2026-06-13', seedIndex: 1, startDate: '2026-06-12' });
  });
});

describe('selectVisibleBaySchedules', () => {
  const fabricationA = buildBay({
    department: 'fabrication',
    id: 'bay-fab-a',
    name: 'Fab A',
    nextAvailableDate: '2026-06-05',
    scheduleOrigin: '2026-06-05',
    slots: [],
  });
  const fabricationB = buildBay({
    department: 'fabrication',
    id: 'bay-fab-b',
    name: 'Fab B',
    nextAvailableDate: '2026-06-05',
    scheduleOrigin: '2026-06-05',
    slots: [],
  });
  const paint = buildBay({
    department: 'paint',
    id: 'bay-paint',
    name: 'Paint',
    nextAvailableDate: '2026-06-05',
    scheduleOrigin: '2026-06-05',
    slots: [],
  });
  const procurement = buildBay({
    department: 'procurement',
    id: 'bay-proc',
    name: 'Procurement',
    nextAvailableDate: '2026-06-05',
    scheduleOrigin: '2026-06-05',
    slots: [],
  });

  it('passes the input through untouched when no filter is given', () => {
    const bays = [paint, fabricationA];

    expect(selectVisibleBaySchedules(bays, undefined)).toBe(bays);
  });

  it('filters to the given bays and orders them by department pipeline, then name', () => {
    const bays = [paint, fabricationB, procurement, fabricationA];
    const result = selectVisibleBaySchedules(bays, [id('bay-paint'), id('bay-fab-b'), id('bay-fab-a'), id('bay-proc')]);

    expect(result.map((bay) => bay.id)).toEqual(['bay-proc', 'bay-fab-a', 'bay-fab-b', 'bay-paint']);
  });

  it('ignores unknown ids and returns an empty list for an empty filter', () => {
    const bays = [paint];

    expect(selectVisibleBaySchedules(bays, [id('bay-missing')])).toEqual([]);
    expect(selectVisibleBaySchedules(bays, [])).toEqual([]);
  });
});
