import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { countWorkingDaysBetween, lastWorkingDayOnOrBefore } from './working-calendar.js';

const day = (value: string) => DateOnlyIso.parse(value);

describe('countWorkingDaysBetween', () => {
  it('counts working days between two dates', () => {
    expect(
      countWorkingDaysBetween(day('2026-06-05'), day('2026-06-10'), {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toBe(3);
    expect(
      countWorkingDaysBetween(day('2026-06-05'), day('2026-06-10'), {
        bayExceptions: new Map([
          ['2026-06-06', 'work'],
          ['2026-06-09', 'off'],
        ]),
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toBe(3);
  });
});

describe('lastWorkingDayOnOrBefore', () => {
  it('returns the date itself when it is a working day', () => {
    expect(lastWorkingDayOnOrBefore(day('2026-06-05'), {})).toBe('2026-06-05');
  });

  it('walks back past org off-days', () => {
    expect(
      lastWorkingDayOnOrBefore(day('2026-06-07'), {
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toBe('2026-06-05');
  });

  it('stops on a bay overtime exception that opens an org off-day', () => {
    expect(
      lastWorkingDayOnOrBefore(day('2026-06-07'), {
        bayExceptions: new Map([['2026-06-07', 'work']]),
        orgOffDays: new Set(['2026-06-06', '2026-06-07']),
      }),
    ).toBe('2026-06-07');
  });

  it('walks back past a bay closure exception', () => {
    expect(
      lastWorkingDayOnOrBefore(day('2026-06-05'), {
        bayExceptions: new Map([['2026-06-05', 'off']]),
      }),
    ).toBe('2026-06-04');
  });
});
