import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import {
  formatReportSubject,
  formatReportWindowParam,
  parseReportSubject,
  parseReportWindowParam,
} from './report-search.js';

const today = '2026-10-12' as DateOnlyIso;
const id = '9bd0c2cb-d97f-4b34-beba-c03e5541c96d';

describe('report window param', () => {
  test('round-trips each kind through its URL form', () => {
    for (const input of [
      { kind: 'month', year: 2026, period: 10 },
      { kind: 'quarter', year: 2026, period: 4 },
      { kind: 'year', year: 2026 },
    ] as const) {
      expect(parseReportWindowParam(formatReportWindowParam(input), today)).toEqual(input);
    }
    expect(formatReportWindowParam({ kind: 'month', year: 2026, period: 3 })).toBe('2026-03');
    expect(formatReportWindowParam({ kind: 'quarter', year: 2026, period: 4 })).toBe('2026-Q4');
  });

  test('falls back to the current month on anything it cannot read', () => {
    for (const param of [undefined, 'nonsense', '2026-13', '2026-Q5', '1999'])
      expect(parseReportWindowParam(param, today)).toEqual({ kind: 'month', year: 2026, period: 10 });
  });
});

describe('report subject param', () => {
  test('round-trips a Category or Machine subject and reads anything else as the fleet', () => {
    for (const subject of [
      { kind: 'category', id },
      { kind: 'machine', id },
    ] as const)
      expect(parseReportSubject(formatReportSubject(subject))).toEqual(subject);
    expect(formatReportSubject({ kind: 'fleet' })).toBeUndefined();
    for (const value of [undefined, '', 'fleet', `job:${id}`, 'machine:not-a-uuid'])
      expect(parseReportSubject(value)).toEqual({ kind: 'fleet' });
  });
});
