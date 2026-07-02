import { DateIso, DateOnlyIso, JobCode, SlotDurationDays, SlotSequence, UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import { type BoardBayFacts, type ProjectableBoardSlot, projectBoard, slotState } from './board-projection.js';
import { deriveJobRouteStopState } from './job-progress.js';
import { projectJobSlots } from './job-slot-projection.js';

const BAY_1 = UUID.parse('00000000-0000-4000-8000-000000000b01');
const BAY_2 = UUID.parse('00000000-0000-4000-8000-000000000b02');
const JOB_1 = UUID.parse('00000000-0000-4000-8000-00000000a001');
const JOB_2 = UUID.parse('00000000-0000-4000-8000-00000000a002');
const NOW = DateIso.parse('2026-06-01T00:00:00.000Z');

const day = (value: string) => DateOnlyIso.parse(value);

function work({
  bayId = BAY_1,
  durationDays,
  jobCode = 1,
  jobId = JOB_1,
  sequence,
  slotId,
}: {
  bayId?: UUID;
  durationDays: number;
  jobCode?: number;
  jobId?: UUID;
  sequence: number;
  slotId: string;
}): ProjectableBoardSlot {
  return {
    bayId,
    createdAt: NOW,
    durationDays: SlotDurationDays.parse(durationDays),
    id: UUID.parse(slotId),
    jobCode: JobCode.parse(jobCode),
    jobId,
    kind: 'work',
    label: null,
    sequence: SlotSequence.parse(sequence),
    updatedAt: NOW,
  };
}

function idle({
  bayId = BAY_1,
  durationDays,
  sequence,
  slotId,
}: {
  bayId?: UUID;
  durationDays: number;
  sequence: number;
  slotId: string;
}): ProjectableBoardSlot {
  return {
    bayId,
    createdAt: NOW,
    durationDays: SlotDurationDays.parse(durationDays),
    id: UUID.parse(slotId),
    jobId: null,
    kind: 'idle',
    label: 'Maintenance',
    sequence: SlotSequence.parse(sequence),
    updatedAt: NOW,
  };
}

function bayFacts(input: {
  bayId?: UUID;
  scheduleOrigin: string;
  slots: readonly ProjectableBoardSlot[];
}): BoardBayFacts {
  return {
    calendarExceptions: [],
    id: input.bayId ?? BAY_1,
    scheduleOrigin: day(input.scheduleOrigin),
    slots: input.slots,
  };
}

describe('projectBoard', () => {
  it('decorates slots with half-open state boundaries', () => {
    const board = projectBoard({
      bays: [
        bayFacts({
          scheduleOrigin: '2026-06-08',
          slots: [
            work({ durationDays: 2, jobId: JOB_1, sequence: 1, slotId: '00000000-0000-4000-8000-000000000001' }),
            work({ durationDays: 1, jobId: JOB_2, sequence: 2, slotId: '00000000-0000-4000-8000-000000000002' }),
            idle({ durationDays: 1, sequence: 3, slotId: '00000000-0000-4000-8000-000000000003' }),
          ],
        }),
      ],
      offDays: [],
      today: day('2026-06-10'),
    });

    expect(
      board.bays[0]?.slots.map((slot) => ({ endDate: slot.endDate, startDate: slot.startDate, state: slot.state })),
    ).toEqual([
      { endDate: '2026-06-10', startDate: '2026-06-08', state: 'done' },
      { endDate: '2026-06-11', startDate: '2026-06-10', state: 'active' },
      { endDate: '2026-06-12', startDate: '2026-06-11', state: 'scheduled' },
    ]);
  });

  it('marks a done Work Slot unfinished when the same Job has future work on another Bay', () => {
    const board = projectBoard({
      bays: [
        bayFacts({
          bayId: BAY_1,
          scheduleOrigin: '2026-06-01',
          slots: [
            work({
              bayId: BAY_1,
              durationDays: 1,
              jobId: JOB_1,
              sequence: 1,
              slotId: '00000000-0000-4000-8000-000000000011',
            }),
            work({
              bayId: BAY_1,
              durationDays: 1,
              jobId: JOB_2,
              sequence: 2,
              slotId: '00000000-0000-4000-8000-000000000012',
            }),
          ],
        }),
        bayFacts({
          bayId: BAY_2,
          scheduleOrigin: '2026-06-11',
          slots: [
            work({
              bayId: BAY_2,
              durationDays: 1,
              jobId: JOB_1,
              sequence: 1,
              slotId: '00000000-0000-4000-8000-000000000013',
            }),
          ],
        }),
      ],
      offDays: [],
      today: day('2026-06-10'),
    });

    const [pastSplitJobSlot, completeJobSlot] = board.bays[0]?.slots ?? [];
    const [futureSplitJobSlot] = board.bays[1]?.slots ?? [];

    expect(pastSplitJobSlot).toMatchObject({ jobId: JOB_1, jobUnfinished: true, state: 'done' });
    expect(completeJobSlot).toMatchObject({ jobId: JOB_2, jobUnfinished: false, state: 'done' });
    expect(futureSplitJobSlot).toMatchObject({ jobId: JOB_1, jobUnfinished: true, state: 'scheduled' });
  });

  it('puts state, but not jobUnfinished, on Idle Slots', () => {
    const board = projectBoard({
      bays: [
        bayFacts({
          scheduleOrigin: '2026-06-10',
          slots: [idle({ durationDays: 1, sequence: 1, slotId: '00000000-0000-4000-8000-000000000021' })],
        }),
      ],
      offDays: [],
      today: day('2026-06-10'),
    });
    const slot = board.bays[0]?.slots[0];

    expect(slot).toMatchObject({ kind: 'idle', state: 'active' });
    expect(slot).not.toHaveProperty('jobUnfinished');
  });

  it('reports the same nextAvailableDate as projectJobSlots', () => {
    const facts = bayFacts({
      scheduleOrigin: '2026-06-08',
      slots: [
        work({ durationDays: 2, sequence: 1, slotId: '00000000-0000-4000-8000-000000000031' }),
        idle({ durationDays: 1, sequence: 2, slotId: '00000000-0000-4000-8000-000000000032' }),
      ],
    });
    const board = projectBoard({
      bays: [facts],
      offDays: [{ date: '2026-06-09' }],
      today: day('2026-06-10'),
    });
    const projectedBay = board.bays[0];

    if (!projectedBay) {
      throw new Error('Expected Board projection to include the Bay');
    }

    expect(projectedBay.nextAvailableDate).toBe(
      projectJobSlots({
        scheduleOrigin: facts.scheduleOrigin,
        slots: facts.slots,
        workingCalendar: projectedBay.workingCalendar,
      }).nextAvailableDate,
    );
  });
});

describe('slotState', () => {
  it('agrees with deriveJobRouteStopState for the same projected span', () => {
    const today = day('2026-06-10');
    const spans = [
      { endDate: day('2026-06-10'), startDate: day('2026-06-08') },
      { endDate: day('2026-06-11'), startDate: day('2026-06-10') },
      { endDate: day('2026-06-12'), startDate: day('2026-06-11') },
    ];

    for (const span of spans) {
      expect(slotState(span, today)).toBe(deriveJobRouteStopState({ slot: span, today }));
    }
  });
});
