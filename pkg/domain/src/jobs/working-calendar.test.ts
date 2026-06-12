import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { countWorkingDaysBetween } from './working-calendar.js';

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
