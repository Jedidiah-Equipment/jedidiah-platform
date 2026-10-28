import type { DateOnlyIso } from '@pkg/schema';
import type { DailyHoursDay } from '@pkg/schema/contracting';
import { expect, test } from 'vitest';
import { heatMapColumns } from './heat-map-columns.js';

/** Dates from `start` for `count` days, 0 hours each. */
const range = (start: string, count: number): DailyHoursDay[] =>
  Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.parse(start) + index * 86_400_000).toISOString().slice(0, 10) as DateOnlyIso,
    hours: 0,
    estimated: false,
  }));

test('pads the first week back to Monday and the last forward to Sunday', () => {
  // 2026-06-03 is a Wednesday; 2026-06-14 is a Sunday.
  const columns = heatMapColumns(range('2026-06-03', 12));
  expect(columns).toHaveLength(2);
  expect(columns[0]?.days.map((day) => day?.date ?? null)).toEqual([
    null,
    null,
    '2026-06-03',
    '2026-06-04',
    '2026-06-05',
    '2026-06-06',
    '2026-06-07',
  ]);
  expect(columns[1]?.days.at(-1)?.date).toBe('2026-06-14');
  expect(heatMapColumns(range('2026-06-03', 9))[1]?.days.map((day) => day?.date ?? null)).toEqual([
    '2026-06-08',
    '2026-06-09',
    '2026-06-10',
    '2026-06-11',
    null,
    null,
    null,
  ]);
});

test('labels the column holding a 1st, and the first column only when the second does not open a month', () => {
  const labelled = (start: string, count: number) =>
    heatMapColumns(range(start, count)).map((column) => column.labelDate);
  expect(labelled('2026-05-20', 21)).toEqual(['2026-05-20', null, '2026-06-01', null]);
  expect(labelled('2026-05-27', 14)).toEqual([null, '2026-06-01', null]);
});

test('lays out nothing for an empty range', () => {
  expect(heatMapColumns([])).toEqual([]);
});
