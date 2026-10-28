import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import {
  allocateDailyHours,
  busiestDailyHours,
  dailyHoursLevel,
  type MeterSegment,
  meterSegments,
  resolveHoursHeatMapRange,
  stintWorkSegments,
} from './daily-hours.js';

const date = (value: string) => value as DateOnlyIso;
const at = (value: string) => new Date(value).toISOString();
const reading = (value: number, capturedAt: string) => ({ value, capturedAt: at(capturedAt) });
const segment = (hours: number, from: string, to: string): MeterSegment => ({ hours, from: at(from), to: at(to) });

describe('meterSegments', () => {
  test('takes every positive delta between consecutive readings and nothing from a backwards pair', () => {
    expect(
      meterSegments([
        reading(100, '2026-06-01T08:00:00+02:00'),
        reading(103.5, '2026-06-01T12:00:00+02:00'),
        reading(103, '2026-06-02T08:00:00+02:00'),
      ]),
    ).toEqual([
      segment(3.5, '2026-06-01T08:00:00+02:00', '2026-06-01T12:00:00+02:00'),
      segment(0, '2026-06-01T12:00:00+02:00', '2026-06-02T08:00:00+02:00'),
    ]);
  });
});

describe('allocateDailyHours', () => {
  test('keeps a segment inside one plant day on that day, exact rather than estimated', () => {
    expect(
      allocateDailyHours(
        [segment(1, '2026-06-01T08:00:00+02:00', '2026-06-01T09:00:00+02:00')],
        date('2026-06-01'),
        date('2026-06-02'),
      ),
    ).toEqual([
      { date: '2026-06-01', hours: 1, estimated: false },
      { date: '2026-06-02', hours: 0, estimated: false },
    ]);
  });

  test('spreads a multi-day delta by elapsed time and marks every day it reached estimated', () => {
    // 30 h over the 72 elapsed hours from Mon 14:00 to Thu 14:00.
    const days = allocateDailyHours(
      [segment(30, '2026-06-01T14:00:00+02:00', '2026-06-04T14:00:00+02:00')],
      date('2026-06-01'),
      date('2026-06-05'),
    );
    expect(days.map((day) => day.hours)).toEqual([4.2, 10, 10, 5.8, 0]);
    expect(days.map((day) => day.estimated)).toEqual([true, true, true, true, false]);
  });

  test('splits a segment across a month boundary by elapsed time', () => {
    const days = allocateDailyHours(
      [segment(6, '2026-06-30T12:00:00+02:00', '2026-07-01T12:00:00+02:00')],
      date('2026-06-30'),
      date('2026-07-01'),
    );
    expect(days).toEqual([
      { date: '2026-06-30', hours: 3, estimated: true },
      { date: '2026-07-01', hours: 3, estimated: true },
    ]);
  });

  test('does not mark a segment that ends on midnight as spanning the next day', () => {
    const days = allocateDailyHours(
      [segment(2, '2026-06-01T22:00:00+02:00', '2026-06-02T00:00:00+02:00')],
      date('2026-06-01'),
      date('2026-06-02'),
    );
    expect(days).toEqual([
      { date: '2026-06-01', hours: 2, estimated: false },
      { date: '2026-06-02', hours: 0, estimated: false },
    ]);
  });

  test('credits only the part of a segment inside the range when it starts before or ends after it', () => {
    const days = allocateDailyHours(
      [segment(24, '2026-05-31T12:00:00+02:00', '2026-06-02T12:00:00+02:00')],
      date('2026-06-01'),
      date('2026-06-01'),
    );
    expect(days).toEqual([{ date: '2026-06-01', hours: 12, estimated: true }]);
  });

  test('puts a zero-length segment wholly on its own day and ignores one outside the range', () => {
    const days = allocateDailyHours(
      [
        segment(2, '2026-06-02T10:00:00+02:00', '2026-06-02T10:00:00+02:00'),
        segment(5, '2026-07-02T10:00:00+02:00', '2026-07-02T10:00:00+02:00'),
      ],
      date('2026-06-01'),
      date('2026-06-02'),
    );
    expect(days.map((day) => day.hours)).toEqual([0, 2]);
    expect(days.some((day) => day.estimated)).toBe(false);
  });

  test('reads plant days, so a late-evening reading belongs to the plant date and not the UTC date', () => {
    const days = allocateDailyHours(
      [segment(1, '2026-06-01T23:00:00+02:00', '2026-06-01T23:30:00+02:00')],
      date('2026-06-01'),
      date('2026-06-02'),
    );
    expect(days.map((day) => day.hours)).toEqual([1, 0]);
  });

  test('returns no days for a range that runs backwards', () => {
    expect(allocateDailyHours([], date('2026-06-02'), date('2026-06-01'))).toEqual([]);
  });
});

describe('stintWorkSegments', () => {
  const ledger = [
    { id: 'a', ...reading(100, '2026-06-01T08:00:00+02:00') },
    { id: 'b', ...reading(102, '2026-06-01T10:00:00+02:00') },
    { id: 'c', ...reading(105, '2026-06-01T14:00:00+02:00') },
    { id: 'd', ...reading(109, '2026-06-02T08:00:00+02:00') },
  ];
  const hours = (stints: Parameters<typeof stintWorkSegments>[1]) =>
    stintWorkSegments(ledger, stints).map((segment) => segment.hours);

  test('keeps the segments from a stint’s arrival reading to its departure reading', () => {
    expect(hours([{ arrivalReadingId: 'b', departureReadingId: 'c' }])).toEqual([3]);
  });

  test('runs an open stint through to the latest reading', () => {
    expect(hours([{ arrivalReadingId: 'b', departureReadingId: null }])).toEqual([3, 4]);
  });

  test('keeps nothing for a stint whose readings are not in the ledger', () => {
    expect(hours([{ arrivalReadingId: 'z', departureReadingId: null }])).toEqual([]);
  });

  test('leaves out a pair sharing the arrival’s Read At that was accepted before it', () => {
    // The previous Job's departure and this Job's arrival were both read at 10:00; only the arrival opens the stint.
    const tied = [
      { id: 'x', ...reading(10, '2026-06-01T08:00:00+02:00') },
      { id: 'departure', ...reading(12, '2026-06-01T10:00:00+02:00') },
      { id: 'arrival', ...reading(15, '2026-06-01T10:00:00+02:00') },
      { id: 'next', ...reading(18, '2026-06-01T12:00:00+02:00') },
    ];
    expect(
      stintWorkSegments(tied, [{ arrivalReadingId: 'arrival', departureReadingId: null }]).map((s) => s.hours),
    ).toEqual([3]);
  });
});

describe('heat map range', () => {
  const today = date('2026-10-28');

  test('defaults to the six calendar months ending today', () => {
    expect(resolveHoursHeatMapRange({}, today)).toEqual({ start: '2026-04-28', end: '2026-10-28' });
  });

  test('caps an end in the future at today and measures the default start from the end', () => {
    expect(resolveHoursHeatMapRange({ end: date('2026-12-31') }, today).end).toBe('2026-10-28');
    expect(resolveHoursHeatMapRange({ end: date('2026-06-30') }, today)).toEqual({
      start: '2025-12-30',
      end: '2026-06-30',
    });
  });
});

describe('dailyHoursLevel', () => {
  test('shades only exactly zero hours as level 0, however small the other days are', () => {
    expect(dailyHoursLevel(0, 10)).toBe(0);
    expect(dailyHoursLevel(0.1, 1000)).toBe(1);
  });

  test('cuts levels at the quarters of the busiest day', () => {
    expect([2.5, 2.6, 5, 5.1, 7.5, 7.6, 10].map((hours) => dailyHoursLevel(hours, 10))).toEqual([1, 2, 2, 3, 3, 4, 4]);
  });

  test('leaves an all-quiet range at level 0', () => {
    expect(busiestDailyHours([{ hours: 0 }, { hours: 0 }])).toBe(0);
    expect(dailyHoursLevel(0, 0)).toBe(0);
  });

  test('takes the busiest day as the scale', () => {
    expect(busiestDailyHours([{ hours: 3 }, { hours: 28.5 }, { hours: 1 }])).toBe(28.5);
  });
});
