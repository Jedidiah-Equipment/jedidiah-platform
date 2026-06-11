import { ProjectedJobSlot } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  createBayNonWorkingDateMatcher,
  describeInsertAtDatePlacement,
  getInsertAtDatePickerBounds,
  resolveBookSlotPlacement,
} from './book-slot-insert-at-date.js';

const currentDate = new Date('2026-06-05T08:00:00.000Z');

describe('getInsertAtDatePickerBounds', () => {
  it('bounds the picker from tomorrow to the next available day, defaulting to the latter', () => {
    expect(getInsertAtDatePickerBounds({ nextAvailableAt: '2026-06-14T22:00:00.000Z' }, {}, currentDate)).toEqual({
      minValue: '2026-06-06',
      maxValue: '2026-06-15',
    });
  });

  it('clamps the max to tomorrow when the queue ended in the past', () => {
    expect(getInsertAtDatePickerBounds({ nextAvailableAt: '2026-06-01T22:00:00.000Z' }, {}, currentDate)).toEqual({
      minValue: '2026-06-06',
      maxValue: '2026-06-06',
    });
  });

  it('pushes the max forward when the next available day rests on a non-working date', () => {
    expect(
      getInsertAtDatePickerBounds(
        { nextAvailableAt: '2026-06-14T22:00:00.000Z' },
        { orgOffDays: new Set(['2026-06-15', '2026-06-16']) },
        currentDate,
      ),
    ).toEqual({
      minValue: '2026-06-06',
      maxValue: '2026-06-17',
    });
  });
});

describe('createBayNonWorkingDateMatcher', () => {
  const matcher = createBayNonWorkingDateMatcher({
    bayExceptions: new Map([
      ['2026-06-08', 'work'],
      ['2026-06-09', 'off'],
    ]),
    orgOffDays: new Set(['2026-06-07', '2026-06-08']),
  });

  it('disables org off-days', () => {
    expect(matcher(new Date(2026, 5, 7))).toBe(true);
  });

  it('keeps overtime-opened off-days enabled', () => {
    expect(matcher(new Date(2026, 5, 8))).toBe(false);
  });

  it('disables bay closures', () => {
    expect(matcher(new Date(2026, 5, 9))).toBe(true);
  });

  it('keeps unmarked dates enabled', () => {
    expect(matcher(new Date(2026, 5, 10))).toBe(false);
  });
});

describe('resolveBookSlotPlacement / describeInsertAtDatePlacement', () => {
  it('describes a work slot split with the job code and resulting durations', () => {
    const placement = resolveBookSlotPlacement({
      bay: {
        scheduleOrigin: '2026-06-05T08:00:00.000Z',
        slots: [workSlot({ durationDays: 10, jobCode: 'JOB-01042' })],
      },
      currentDate,
      startDate: '2026-06-09',
      workingCalendar: {},
    });

    expect(placement).toMatchObject({ type: 'split', beforeDays: 4, afterDays: 6 });
    expect(describeInsertAtDatePlacement(placement)).toEqual({
      startText: 'Starts Tue, Jun 9',
      splitWarning: "Splits JOB-01042's 10-day slot into 4 + 6.",
    });
  });

  it('describes an idle slot split by its label, defaulting unlabeled idle', () => {
    const labeled = resolveBookSlotPlacement({
      bay: {
        scheduleOrigin: '2026-06-05T08:00:00.000Z',
        slots: [idleSlot({ durationDays: 10, label: 'Bay Tidying' })],
      },
      currentDate,
      startDate: '2026-06-09',
      workingCalendar: {},
    });

    expect(describeInsertAtDatePlacement(labeled).splitWarning).toBe("Splits Bay Tidying's 10-day slot into 4 + 6.");

    const unlabeled = resolveBookSlotPlacement({
      bay: {
        scheduleOrigin: '2026-06-05T08:00:00.000Z',
        slots: [idleSlot({ durationDays: 10, label: null })],
      },
      currentDate,
      startDate: '2026-06-09',
      workingCalendar: {},
    });

    expect(describeInsertAtDatePlacement(unlabeled).splitWarning).toBe("Splits Idle's 10-day slot into 4 + 6.");
  });

  it('describes a clean append without a split warning', () => {
    const placement = resolveBookSlotPlacement({
      bay: {
        scheduleOrigin: '2026-06-05T08:00:00.000Z',
        slots: [workSlot({ durationDays: 4, jobCode: 'JOB-01042' })],
      },
      currentDate,
      startDate: '2026-06-09',
      workingCalendar: {},
    });

    expect(placement.type).toBe('append');
    expect(describeInsertAtDatePlacement(placement)).toEqual({
      startText: 'Starts Tue, Jun 9',
      splitWarning: null,
    });
  });
});

function workSlot(input: { durationDays: number; jobCode: string }): ProjectedJobSlot {
  return ProjectedJobSlot.parse({
    ...projectedSlotBase(input.durationDays),
    jobCode: input.jobCode,
    jobId: '00000000-0000-4000-8000-00000000aaaa',
    kind: 'work',
    label: null,
  });
}

function idleSlot(input: { durationDays: number; label: string | null }): ProjectedJobSlot {
  return ProjectedJobSlot.parse({
    ...projectedSlotBase(input.durationDays),
    jobId: null,
    kind: 'idle',
    label: input.label,
  });
}

function projectedSlotBase(durationDays: number) {
  return {
    bayId: '00000000-0000-4000-8000-000000000b01',
    createdAt: '2026-06-05T08:00:00.000Z',
    durationDays,
    endAt: '2026-06-14T22:00:00.000Z',
    id: '00000000-0000-4000-8000-000000000001',
    sequence: 1,
    startAt: '2026-06-04T22:00:00.000Z',
    updatedAt: '2026-06-05T08:00:00.000Z',
  };
}
