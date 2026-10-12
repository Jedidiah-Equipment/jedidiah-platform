import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import {
  changeReportWindowKind,
  currentReportWindow,
  formatReportWindowParam,
  parseReportWindowParam,
  reportWindowLabel,
  resolveReportWindow,
  shiftReportWindow,
  trailingMonthWindows,
} from './report-window.js';

const today = '2026-10-12' as DateOnlyIso;

describe('resolveReportWindow', () => {
  test('caps the current period at today and counts only elapsed days', () => {
    expect(resolveReportWindow({ kind: 'month', year: 2026, period: 10 }, today)).toEqual({
      kind: 'month',
      year: 2026,
      period: 10,
      start: '2026-10-01',
      end: '2026-10-12',
      days: 12,
    });
    expect(resolveReportWindow({ kind: 'quarter', year: 2026, period: 4 }, today)).toMatchObject({
      start: '2026-10-01',
      end: '2026-10-12',
      days: 12,
    });
    expect(resolveReportWindow({ kind: 'year', year: 2026 }, today)).toMatchObject({
      period: null,
      start: '2026-01-01',
      end: '2026-10-12',
      days: 285,
    });
  });

  test('a window after today has no days, and past months keep their calendar length', () => {
    expect(resolveReportWindow({ kind: 'month', year: 2026, period: 11 }, today).days).toBe(0);
    expect(resolveReportWindow({ kind: 'month', year: 2028, period: 2 }, '2028-12-31' as DateOnlyIso)).toMatchObject({
      start: '2028-02-01',
      end: '2028-02-29',
      days: 29,
    });
    expect(resolveReportWindow({ kind: 'quarter', year: 2026, period: 2 }, today)).toMatchObject({
      start: '2026-04-01',
      end: '2026-06-30',
      days: 91,
    });
  });
});

describe('trailingMonthWindows', () => {
  test('returns twelve month windows, oldest first, ending in the month holding the window end', () => {
    const months = trailingMonthWindows(resolveReportWindow({ kind: 'quarter', year: 2026, period: 4 }, today), today);
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ start: '2025-11-01', end: '2025-11-30', days: 30 });
    expect(months[11]).toMatchObject({ start: '2026-10-01', end: '2026-10-12', days: 12 });
    const year = trailingMonthWindows(resolveReportWindow({ kind: 'year', year: 2025 }, today), today);
    expect([year[0]?.start, year[11]?.start]).toEqual(['2025-01-01', '2025-12-01']);
  });
});

describe('report window params', () => {
  test('round-trips each kind through its URL form', () => {
    for (const input of [
      { kind: 'month', year: 2026, period: 10 },
      { kind: 'quarter', year: 2026, period: 4 },
      { kind: 'year', year: 2026 },
    ] as const) {
      const param = formatReportWindowParam(input);
      expect(parseReportWindowParam(param, today)).toEqual(input);
    }
    expect(formatReportWindowParam({ kind: 'month', year: 2026, period: 3 })).toBe('2026-03');
    expect(formatReportWindowParam({ kind: 'quarter', year: 2026, period: 4 })).toBe('2026-Q4');
  });

  test('falls back to the current month on anything it cannot read', () => {
    for (const param of [undefined, 'nonsense', '2026-13', '2026-Q5', '1999'])
      expect(parseReportWindowParam(param, today)).toEqual({ kind: 'month', year: 2026, period: 10 });
  });

  test('steps across year boundaries and labels each kind', () => {
    expect(shiftReportWindow({ kind: 'month', year: 2026, period: 1 }, -1)).toEqual({
      kind: 'month',
      year: 2025,
      period: 12,
    });
    expect(shiftReportWindow({ kind: 'quarter', year: 2026, period: 4 }, 1)).toEqual({
      kind: 'quarter',
      year: 2027,
      period: 1,
    });
    expect(shiftReportWindow({ kind: 'year', year: 2026 }, -1)).toEqual({ kind: 'year', year: 2025 });
    expect(reportWindowLabel({ kind: 'month', year: 2026, period: 10 })).toBe('October 2026');
    expect(reportWindowLabel({ kind: 'quarter', year: 2026, period: 4 })).toBe('Q4 2026');
    expect(reportWindowLabel({ kind: 'year', year: 2026 })).toBe('2026');
  });

  test('a new kind keeps the period holding the current window start, and today opens each kind', () => {
    expect(changeReportWindowKind({ kind: 'month', year: 2026, period: 8 }, 'quarter')).toEqual({
      kind: 'quarter',
      year: 2026,
      period: 3,
    });
    expect(changeReportWindowKind({ kind: 'quarter', year: 2026, period: 3 }, 'month')).toEqual({
      kind: 'month',
      year: 2026,
      period: 7,
    });
    expect(changeReportWindowKind({ kind: 'quarter', year: 2026, period: 3 }, 'year')).toEqual({
      kind: 'year',
      year: 2026,
    });
    expect(currentReportWindow('quarter', today)).toEqual({ kind: 'quarter', year: 2026, period: 4 });
  });
});
