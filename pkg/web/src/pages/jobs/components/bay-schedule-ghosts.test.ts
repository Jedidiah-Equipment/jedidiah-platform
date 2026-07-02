import {
  type BaySchedule,
  DateIso,
  type DateOnlyIso,
  JobCode,
  type JobSchedulePreviewBay,
  type JobSchedulePreviewResult,
  type UUID,
} from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  createSchedulePreviewRequest,
  deriveGhostBaySchedules,
  selectVisibleBaySchedules,
} from './bay-schedule-ghosts.js';

const id = (value: string) => value as UUID;
const day = (value: string) => value as DateOnlyIso;
const timestamp = DateIso.parse('2026-06-01T00:00:00.000Z');

describe('createSchedulePreviewRequest', () => {
  it('keeps valid seeds in form order and records their original indexes', () => {
    const request = createSchedulePreviewRequest([
      { bayId: id('bay-a'), durationDays: Number.NaN, startDate: '2026-06-09' },
      { bayId: id('bay-b'), durationDays: 2, startDate: '2026-06-09' },
      { bayId: id('bay-c'), durationDays: 0, startDate: '2026-06-10' },
      { bayId: id('bay-d'), durationDays: 1.5, startDate: '2026-06-10' },
      { bayId: id('bay-e'), durationDays: 1, startDate: 'not-a-date' },
    ]);

    expect(request).toEqual({
      input: {
        seeds: [
          { bayId: 'bay-b', durationDays: 2, startDate: '2026-06-09' },
          { bayId: 'bay-e', durationDays: 1 },
        ],
      },
      seedIndexByPreviewIndex: [1, 4],
    });
  });

  it('filters hidden lanes while preserving original seed indexes', () => {
    const request = createSchedulePreviewRequest(
      [
        { bayId: id('bay-hidden'), durationDays: 2, startDate: '2026-06-09' },
        { bayId: id('bay-visible'), durationDays: 3, startDate: '2026-06-10' },
      ],
      { includeSeed: (seed) => seed.bayId === id('bay-visible') },
    );

    expect(request).toEqual({
      input: {
        seeds: [{ bayId: 'bay-visible', durationDays: 3, startDate: '2026-06-10' }],
      },
      seedIndexByPreviewIndex: [1],
    });
  });
});

describe('deriveGhostBaySchedules', () => {
  it('replaces affected lanes and maps preview seed indexes back to form row indexes', () => {
    const baseBay = buildBay({ id: 'bay-1', nextAvailableDate: '2026-06-10' });
    const untouchedBay = buildBay({ id: 'bay-2', nextAvailableDate: '2026-06-05' });
    const previewBay: JobSchedulePreviewBay = {
      ...baseBay,
      nextAvailableDate: day('2026-06-12'),
      slots: [
        {
          bayId: id('bay-1'),
          createdAt: timestamp,
          durationDays: 2,
          endDate: day('2026-06-07'),
          id: 'slot-a:before',
          jobCode: JobCode.parse('JOB-00001'),
          jobId: id('job-a'),
          jobUnfinished: true,
          kind: 'work',
          label: null,
          previewSplit: { half: 'before', sourceSlotId: 'slot-a' },
          sequence: 1,
          startDate: day('2026-06-05'),
          state: 'active',
          updatedAt: timestamp,
        },
      ],
    };
    const preview: JobSchedulePreviewResult = {
      bays: [previewBay],
      ghosts: [
        {
          bayId: id('bay-1'),
          durationDays: 3,
          endDate: day('2026-06-12'),
          id: 'ghost:bay-1:0',
          placementType: 'split',
          seedIndex: 0,
          startDate: day('2026-06-09'),
        },
      ],
      placements: [
        {
          idleGapDays: 0,
          startDate: day('2026-06-09'),
          type: 'append',
        },
      ],
    };

    const result = deriveGhostBaySchedules({
      bays: [baseBay, untouchedBay],
      preview,
      seedIndexByPreviewIndex: [3],
    });

    expect(result.bays[0]).toBe(previewBay);
    expect(result.bays[1]).toBe(untouchedBay);
    expect(result.ghosts).toEqual([
      expect.objectContaining({
        id: 'ghost:bay-1:3',
        seedIndex: 3,
      }),
    ]);
  });
});

describe('selectVisibleBaySchedules', () => {
  const fabricationA = buildBay({
    department: 'fabrication',
    id: 'bay-fab-a',
    name: 'Fab A',
    nextAvailableDate: '2026-06-05',
  });
  const fabricationB = buildBay({
    department: 'fabrication',
    id: 'bay-fab-b',
    name: 'Fab B',
    nextAvailableDate: '2026-06-05',
  });
  const paint = buildBay({
    department: 'paint',
    id: 'bay-paint',
    name: 'Paint',
    nextAvailableDate: '2026-06-05',
  });

  it('returns the same list when no visible ids are supplied', () => {
    const bays = [paint, fabricationB, fabricationA];

    expect(selectVisibleBaySchedules(bays, undefined)).toBe(bays);
  });

  it('filters to the selected ids and sorts them into department order', () => {
    expect(selectVisibleBaySchedules([paint, fabricationB, fabricationA], [id('bay-paint'), id('bay-fab-a')])).toEqual([
      fabricationA,
      paint,
    ]);
  });
});

function buildBay(input: {
  department?: BaySchedule['department'];
  id: string;
  name?: string;
  nextAvailableDate: string;
}): BaySchedule {
  return {
    calendarExceptions: [],
    createdAt: timestamp,
    department: input.department ?? 'fabrication',
    disabledAt: null,
    id: id(input.id),
    name: input.name ?? `Bay ${input.id}`,
    nextAvailableDate: day(input.nextAvailableDate),
    scheduleOrigin: day('2026-06-05'),
    slots: [],
    updatedAt: timestamp,
  } as unknown as BaySchedule;
}
