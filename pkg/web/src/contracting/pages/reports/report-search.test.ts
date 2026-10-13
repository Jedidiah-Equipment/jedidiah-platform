import type { DateOnlyIso } from '@pkg/schema';
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { describe, expect, test } from 'vitest';
import {
  formatReportSubject,
  formatReportWindowParam,
  parseReportSubject,
  parseReportWindowParam,
  ReportsSearch,
} from './report-search.js';

const today = '2026-10-12' as DateOnlyIso;
const id = '9bd0c2cb-d97f-4b34-beba-c03e5541c96d';

describe('report window param', () => {
  test('falls back to the current month on anything it cannot read', () => {
    for (const param of [undefined, 'nonsense', '2026-13', '2026-Q5', '1999'])
      expect(parseReportWindowParam(param, today)).toEqual({ kind: 'month', year: 2026, period: 10 });
  });
});

describe('reports URL through the router codec', () => {
  const windowAt = (address: string) =>
    parseReportWindowParam(ReportsSearch.parse(defaultParseSearch(address)).window, today);

  test('reads a bare or quoted year as the year window', () => {
    for (const address of ['?window=2026', '?window=%222026%22'])
      expect(windowAt(address)).toEqual({ kind: 'year', year: 2026 });
  });

  test('writes each window kind in its bare URL form and reads it back', () => {
    for (const [input, address] of [
      [{ kind: 'year', year: 2026 }, '?window=2026'],
      [{ kind: 'month', year: 2026, period: 10 }, '?window=2026-10'],
      [{ kind: 'month', year: 2026, period: 3 }, '?window=2026-03'],
      [{ kind: 'quarter', year: 2026, period: 4 }, '?window=2026-Q4'],
    ] as const) {
      expect(defaultStringifySearch({ window: formatReportWindowParam(input) })).toBe(address);
      expect(windowAt(address)).toEqual(input);
    }
  });

  test('drops a malformed value instead of refusing the page', () => {
    expect(ReportsSearch.parse({ tab: 'foo', window: true, subject: 5 })).toEqual({});
    expect(ReportsSearch.parse({ window: {} })).toEqual({});
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
