import { describe, expect, it } from 'vitest';

import { bayWorkingCalendars } from './bay-schedule-projection.js';

describe('bayWorkingCalendars', () => {
  it('merges org Off-Days with each Bay’s exceptions, sharing the org set', () => {
    const calendars = bayWorkingCalendars(
      [
        { calendarExceptions: [{ date: '2026-06-20', direction: 'off' as const }], id: 'bay-1' },
        { calendarExceptions: [], id: 'bay-2' },
      ],
      [{ date: '2026-06-16' }],
    );

    expect(calendars.get('bay-1')?.orgOffDays?.has('2026-06-16')).toBe(true);
    expect(calendars.get('bay-1')?.bayExceptions?.get('2026-06-20')).toBe('off');
    expect(calendars.get('bay-2')?.orgOffDays?.has('2026-06-16')).toBe(true);
    expect(calendars.get('bay-2')?.bayExceptions?.size).toBe(0);
  });
});
