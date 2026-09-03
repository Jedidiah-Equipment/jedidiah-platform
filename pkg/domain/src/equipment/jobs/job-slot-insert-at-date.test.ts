import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { resolveInsertAtDatePlacement } from './job-slot-insert-at-date.js';

const day = (value: string) => DateOnlyIso.parse(value);
const scheduleOrigin = day('2026-06-05');
const currentDate = scheduleOrigin;

describe('resolveInsertAtDatePlacement', () => {
  it('appends on an empty queue', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-09'),
      scheduleOrigin,
      slots: [],
    });

    expect(placement).toEqual({ type: 'append', startDate: '2026-06-05', idleGapDays: 0 });
  });

  it('appends when no date is picked, sharing the same placement contract', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10 })],
    });

    expect(placement).toEqual({ type: 'append', startDate: '2026-06-15', idleGapDays: 0 });
  });

  it('reports the idle gap owed when a date-less booking lands on a queue that ended before today', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate: day('2026-06-05'),
      scheduleOrigin: day('2026-06-01'),
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 1 })],
    });

    expect(placement).toEqual({ type: 'append', startDate: '2026-06-05', idleGapDays: 3 });
  });

  it('appends when the picked date is exactly the next available day', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-15'),
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10 })],
    });

    expect(placement).toEqual({ type: 'append', startDate: '2026-06-15', idleGapDays: 0 });
  });

  it('clamps a picked date past the next available day to a plain append', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-25'),
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10 })],
    });

    expect(placement).toEqual({ type: 'append', startDate: '2026-06-15', idleGapDays: 0 });
  });

  it('appends from today when the queue ended before today, matching the idle-gap append', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate: day('2026-06-05'),
      pickedDate: day('2026-06-20'),
      scheduleOrigin: day('2026-06-01'),
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 1 })],
    });

    expect(placement).toEqual({ type: 'append', startDate: '2026-06-05', idleGapDays: 3 });
  });

  it("inserts cleanly before a slot when the picked date is exactly the slot's projected start", () => {
    const slots = [
      slot({ id: 'slot-1', sequence: 1, durationDays: 4 }),
      slot({ id: 'slot-2', sequence: 2, durationDays: 5 }),
    ];
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-09'),
      scheduleOrigin,
      slots,
    });

    expect(placement).toMatchObject({
      type: 'insert-before',
      targetSlot: { id: 'slot-2' },
      startDate: '2026-06-09',
    });
  });

  it('inserts before the first slot when the picked date lands before a future schedule origin', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate: day('2026-06-05'),
      pickedDate: day('2026-06-06'),
      scheduleOrigin: day('2026-06-10'),
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 3 })],
    });

    expect(placement).toMatchObject({
      type: 'insert-before',
      targetSlot: { id: 'slot-1' },
      startDate: '2026-06-10',
    });
  });

  it('splits a work slot strictly containing the picked date, preserving total working days', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-09'),
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10 })],
    });

    expect(placement).toMatchObject({
      type: 'split',
      targetSlot: { id: 'slot-1' },
      beforeDays: 4,
      afterDays: 6,
      startDate: '2026-06-09',
    });
  });

  it('splits an idle slot exactly like a work slot', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-09'),
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10, kind: 'idle', label: 'Bay Tidying' })],
    });

    expect(placement).toMatchObject({
      type: 'split',
      targetSlot: { id: 'slot-1', label: 'Bay Tidying' },
      beforeDays: 4,
      afterDays: 6,
    });
  });

  it('counts split halves in working days, skipping off-days', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-09'),
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10 })],
      workingCalendar: { orgOffDays: new Set(['2026-06-06', '2026-06-07']) },
    });

    expect(placement).toMatchObject({
      type: 'split',
      beforeDays: 2,
      afterDays: 8,
      startDate: '2026-06-09',
    });
  });

  it('normalizes a picked date on an off-day forward to the next working day', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-06'),
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10 })],
      workingCalendar: { orgOffDays: new Set(['2026-06-06', '2026-06-07']) },
    });

    expect(placement).toMatchObject({
      type: 'split',
      beforeDays: 1,
      afterDays: 9,
      startDate: '2026-06-08',
    });
  });

  it('respects bay overtime that opens an org off-day when normalizing the picked date', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-06'),
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10 })],
      workingCalendar: {
        bayExceptions: new Map([['2026-06-06', 'work']]),
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      },
    });

    expect(placement).toMatchObject({
      type: 'split',
      beforeDays: 1,
      afterDays: 9,
      startDate: '2026-06-06',
    });
  });

  it('floors a picked date on or before today to tomorrow, never disturbing the slot over today', () => {
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-01'),
      scheduleOrigin,
      slots: [slot({ id: 'slot-1', sequence: 1, durationDays: 10 })],
    });

    expect(placement).toMatchObject({
      type: 'split',
      beforeDays: 1,
      afterDays: 9,
      startDate: '2026-06-06',
    });
  });

  it('treats a slot whose projection cursor rests on an off-day as starting on its first working day', () => {
    const slots = [
      slot({ id: 'slot-1', sequence: 1, durationDays: 1 }),
      slot({ id: 'slot-2', sequence: 2, durationDays: 3 }),
    ];
    const placement = resolveInsertAtDatePlacement({
      currentDate,
      pickedDate: day('2026-06-08'),
      scheduleOrigin,
      slots,
      workingCalendar: { orgOffDays: new Set(['2026-06-06', '2026-06-07']) },
    });

    expect(placement).toMatchObject({
      type: 'insert-before',
      targetSlot: { id: 'slot-2' },
      startDate: '2026-06-08',
    });
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
