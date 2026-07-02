import {
  BaySchedule,
  DateIso,
  DateOnlyIso,
  JobCode,
  type JobSlotState,
  SlotDurationDays,
  SlotSequence,
  UUID,
} from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import {
  foldJobScheduleStates,
  getScheduleJobIds,
  resolveBoardWindowFrom,
  sliceJobSchedule,
  windowActiveBoard,
} from './board-slices.js';
import { JOB_DEPARTMENT_PIPELINE } from './job-department-pipeline.js';

const BAY_1 = UUID.parse('00000000-0000-4000-8000-000000000b01');
const BAY_2 = UUID.parse('00000000-0000-4000-8000-000000000b02');
const BAY_3 = UUID.parse('00000000-0000-4000-8000-000000000b03');
const JOB_1 = UUID.parse('00000000-0000-4000-8000-00000000a001');
const JOB_2 = UUID.parse('00000000-0000-4000-8000-00000000a002');
const JOB_3 = UUID.parse('00000000-0000-4000-8000-00000000a003');
const NOW = DateIso.parse('2026-06-01T00:00:00.000Z');

const day = (value: string) => DateOnlyIso.parse(value);

function workSlot({
  bayId = BAY_1,
  endDate,
  jobCode = 1,
  jobId = JOB_1,
  jobUnfinished = false,
  sequence,
  slotId,
  startDate,
  state,
}: {
  bayId?: UUID;
  endDate: string;
  jobCode?: number;
  jobId?: UUID;
  jobUnfinished?: boolean;
  sequence: number;
  slotId: string;
  startDate: string;
  state: JobSlotState;
}): BaySchedule['slots'][number] {
  return {
    bayId,
    createdAt: NOW,
    durationDays: SlotDurationDays.parse(1),
    endDate: day(endDate),
    id: UUID.parse(slotId),
    jobCode: JobCode.parse(jobCode),
    jobId,
    jobUnfinished,
    kind: 'work',
    label: null,
    sequence: SlotSequence.parse(sequence),
    startDate: day(startDate),
    state,
    updatedAt: NOW,
  };
}

function idleSlot({
  bayId = BAY_1,
  endDate,
  sequence,
  slotId,
  startDate,
  state,
}: {
  bayId?: UUID;
  endDate: string;
  sequence: number;
  slotId: string;
  startDate: string;
  state: JobSlotState;
}): BaySchedule['slots'][number] {
  return {
    bayId,
    createdAt: NOW,
    durationDays: SlotDurationDays.parse(1),
    endDate: day(endDate),
    id: UUID.parse(slotId),
    jobId: null,
    kind: 'idle',
    label: 'Maintenance',
    sequence: SlotSequence.parse(sequence),
    startDate: day(startDate),
    state,
    updatedAt: NOW,
  };
}

function baySchedule({
  bayId = BAY_1,
  department = 'fabrication',
  name = 'Fabrication Bay',
  nextAvailableDate = '2026-07-01',
  slots,
}: {
  bayId?: UUID;
  department?: BaySchedule['department'];
  name?: string;
  nextAvailableDate?: string;
  slots: BaySchedule['slots'];
}): BaySchedule {
  return BaySchedule.parse({
    calendarExceptions: [],
    createdAt: NOW,
    currentOperator: null,
    department,
    disabledAt: null,
    id: bayId,
    name,
    nextAvailableDate: day(nextAvailableDate),
    scheduleOrigin: day('2026-06-01'),
    slots,
    updatedAt: NOW,
  });
}

describe('windowActiveBoard', () => {
  it('widens history when from is before today and keeps unfinished Work Slots from the far past', () => {
    const bay = baySchedule({
      nextAvailableDate: '2026-08-01',
      slots: [
        workSlot({
          endDate: '2026-05-02',
          jobUnfinished: true,
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000001',
          startDate: '2026-05-01',
          state: 'done',
        }),
        idleSlot({
          endDate: '2026-06-04',
          sequence: 2,
          slotId: '00000000-0000-4000-8000-000000000002',
          startDate: '2026-06-03',
          state: 'done',
        }),
        idleSlot({
          endDate: '2026-06-05',
          sequence: 3,
          slotId: '00000000-0000-4000-8000-000000000003',
          startDate: '2026-06-04',
          state: 'done',
        }),
        workSlot({
          endDate: '2026-06-10',
          sequence: 4,
          slotId: '00000000-0000-4000-8000-000000000004',
          startDate: '2026-06-09',
          state: 'done',
        }),
      ],
    });

    const [windowed] = windowActiveBoard([bay], { from: day('2026-06-05'), today: day('2026-06-10') });

    expect(windowed?.nextAvailableDate).toBe('2026-08-01');
    expect(windowed?.slots.map((slot) => slot.id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
    ]);
  });

  it('uses the default half-open Active Board when from equals today', () => {
    const bay = baySchedule({
      slots: [
        workSlot({
          endDate: '2026-05-02',
          jobUnfinished: true,
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000011',
          startDate: '2026-05-01',
          state: 'done',
        }),
        workSlot({
          endDate: '2026-06-10',
          sequence: 2,
          slotId: '00000000-0000-4000-8000-000000000012',
          startDate: '2026-06-09',
          state: 'done',
        }),
        idleSlot({
          endDate: '2026-06-10',
          sequence: 3,
          slotId: '00000000-0000-4000-8000-000000000013',
          startDate: '2026-06-09',
          state: 'done',
        }),
        workSlot({
          endDate: '2026-06-11',
          sequence: 4,
          slotId: '00000000-0000-4000-8000-000000000014',
          startDate: '2026-06-10',
          state: 'active',
        }),
        idleSlot({
          endDate: '2026-06-11',
          sequence: 5,
          slotId: '00000000-0000-4000-8000-000000000015',
          startDate: '2026-06-10',
          state: 'active',
        }),
      ],
    });

    const [windowed] = windowActiveBoard([bay], { from: day('2026-06-10'), today: day('2026-06-10') });

    expect(windowed?.slots.map((slot) => slot.id)).toEqual([
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000014',
      '00000000-0000-4000-8000-000000000015',
    ]);
  });

  it('keeps forward Slots when from is after today', () => {
    const bay = baySchedule({
      slots: [
        workSlot({
          endDate: '2026-06-10',
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000021',
          startDate: '2026-06-09',
          state: 'done',
        }),
        workSlot({
          endDate: '2026-06-11',
          sequence: 2,
          slotId: '00000000-0000-4000-8000-000000000022',
          startDate: '2026-06-10',
          state: 'active',
        }),
      ],
    });

    const [windowed] = windowActiveBoard([bay], { from: day('2026-06-20'), today: day('2026-06-10') });

    expect(windowed?.slots.map((slot) => slot.id)).toEqual(['00000000-0000-4000-8000-000000000022']);
  });
});

describe('resolveBoardWindowFrom', () => {
  it('defaults to today', () => {
    expect(resolveBoardWindowFrom(undefined, day('2026-06-10'))).toBe('2026-06-10');
  });

  it('clamps requested history to 365 days before today', () => {
    expect(resolveBoardWindowFrom({ from: day('2024-01-01') }, day('2026-06-10'))).toBe('2025-06-10');
  });

  it('passes through requested history inside the clamp', () => {
    expect(resolveBoardWindowFrom({ from: day('2025-06-11') }, day('2026-06-10'))).toBe('2025-06-11');
  });
});

describe('sliceJobSchedule', () => {
  it('groups matching Work Slots by department and drops bays with no matching slots', () => {
    const fabricationBay = baySchedule({
      bayId: BAY_1,
      department: 'fabrication',
      name: 'Fabrication Bay',
      slots: [
        workSlot({
          bayId: BAY_1,
          endDate: '2026-06-02',
          jobId: JOB_1,
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000031',
          startDate: '2026-06-01',
          state: 'done',
        }),
        workSlot({
          bayId: BAY_1,
          endDate: '2026-06-03',
          jobId: JOB_2,
          sequence: 2,
          slotId: '00000000-0000-4000-8000-000000000032',
          startDate: '2026-06-02',
          state: 'done',
        }),
      ],
    });
    const assemblyBay = baySchedule({
      bayId: BAY_2,
      department: 'assembly',
      name: 'Assembly Bay',
      slots: [
        workSlot({
          bayId: BAY_2,
          endDate: '2026-06-05',
          jobId: JOB_1,
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000033',
          startDate: '2026-06-04',
          state: 'scheduled',
        }),
      ],
    });
    const paintBay = baySchedule({
      bayId: BAY_3,
      department: 'paint',
      name: 'Paint Bay',
      slots: [
        workSlot({
          bayId: BAY_3,
          endDate: '2026-06-06',
          jobId: JOB_2,
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000034',
          startDate: '2026-06-05',
          state: 'scheduled',
        }),
      ],
    });

    const schedule = sliceJobSchedule([fabricationBay, assemblyBay, paintBay], JOB_1);

    expect(schedule.map((group) => group.department)).toEqual(
      JOB_DEPARTMENT_PIPELINE.map(({ department }) => department),
    );
    expect(schedule.find((group) => group.department === 'fabrication')?.bays).toMatchObject([
      {
        id: BAY_1,
        slots: [{ id: '00000000-0000-4000-8000-000000000031', jobId: JOB_1 }],
      },
    ]);
    expect(schedule.find((group) => group.department === 'assembly')?.bays).toMatchObject([
      {
        id: BAY_2,
        slots: [{ id: '00000000-0000-4000-8000-000000000033', jobId: JOB_1 }],
      },
    ]);
    expect(schedule.find((group) => group.department === 'paint')?.bays).toEqual([]);
  });
});

describe('foldJobScheduleStates', () => {
  it('counts state from projected slots across bays and keeps zero entries for unscheduled Jobs', () => {
    const fabricationBay = baySchedule({
      bayId: BAY_1,
      slots: [
        workSlot({
          endDate: '2026-06-02',
          jobId: JOB_1,
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000041',
          startDate: '2026-06-01',
          state: 'scheduled',
        }),
        workSlot({
          endDate: '2026-06-11',
          jobId: JOB_2,
          sequence: 2,
          slotId: '00000000-0000-4000-8000-000000000042',
          startDate: '2026-06-10',
          state: 'active',
        }),
      ],
    });
    const assemblyBay = baySchedule({
      bayId: BAY_2,
      department: 'assembly',
      slots: [
        workSlot({
          bayId: BAY_2,
          endDate: '2026-06-12',
          jobId: JOB_1,
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000043',
          startDate: '2026-06-10',
          state: 'active',
        }),
        workSlot({
          bayId: BAY_2,
          endDate: '2026-06-20',
          jobId: JOB_1,
          sequence: 2,
          slotId: '00000000-0000-4000-8000-000000000044',
          startDate: '2026-06-18',
          state: 'done',
        }),
      ],
    });

    const states = foldJobScheduleStates([fabricationBay, assemblyBay], [JOB_1, JOB_3]);

    expect(states.get(JOB_1)).toEqual({
      active: 1,
      done: 1,
      endDate: '2026-06-20',
      scheduled: 1,
      startDate: '2026-06-01',
      total: 3,
    });
    expect(states.get(JOB_3)).toEqual({
      active: 0,
      done: 0,
      endDate: null,
      scheduled: 0,
      startDate: null,
      total: 0,
    });
  });
});

describe('getScheduleJobIds', () => {
  it('plucks distinct Work Slot Job ids and ignores Idle Slots', () => {
    const bay = baySchedule({
      slots: [
        workSlot({
          endDate: '2026-06-02',
          jobId: JOB_1,
          sequence: 1,
          slotId: '00000000-0000-4000-8000-000000000051',
          startDate: '2026-06-01',
          state: 'done',
        }),
        idleSlot({
          endDate: '2026-06-03',
          sequence: 2,
          slotId: '00000000-0000-4000-8000-000000000052',
          startDate: '2026-06-02',
          state: 'done',
        }),
        workSlot({
          endDate: '2026-06-04',
          jobId: JOB_1,
          sequence: 3,
          slotId: '00000000-0000-4000-8000-000000000053',
          startDate: '2026-06-03',
          state: 'done',
        }),
        workSlot({
          endDate: '2026-06-05',
          jobId: JOB_2,
          sequence: 4,
          slotId: '00000000-0000-4000-8000-000000000054',
          startDate: '2026-06-04',
          state: 'scheduled',
        }),
      ],
    });

    expect(getScheduleJobIds([bay])).toEqual([JOB_1, JOB_2]);
  });
});
