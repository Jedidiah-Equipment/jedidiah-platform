import { DateIso, DateOnlyIso, JobCode, type JobSchedulePreviewPlacement } from '@pkg/schema';
import { describe, expect, it, vi } from 'vitest';

import { describeInsertAtDatePlacement, getInsertAtDatePickerBounds } from './book-slot-insert-at-date.js';
import { fromJobCalendarDateKey, toJobCalendarDateKey } from './job-date-key.js';

const day = (value: string) => DateOnlyIso.parse(value);

// The schedule UI must show the same dates from any browser timezone.
// A regression that leaks the ambient timezone into picker bounds, placement
// placement copy, or the local calendar bridge fails here.
const TRIPWIRE_TIME_ZONES = ['Africa/Johannesburg', 'UTC', 'America/New_York', 'Pacific/Auckland'];

function inEveryTimeZone<T>(compute: () => T): T[] {
  try {
    return TRIPWIRE_TIME_ZONES.map((timeZone) => {
      vi.stubEnv('TZ', timeZone);

      return compute();
    });
  } finally {
    vi.unstubAllEnvs();
  }
}

describe('schedule UI timezone tripwire', () => {
  it('actually switches the process timezone (the tripwire is live)', () => {
    // If Node ever started caching the zone past env changes, every cross-zone
    // assertion above would degrade into testing one zone four times.
    const offsets = new Set(inEveryTimeZone(() => new Date('2026-06-09T12:00:00.000Z').getTimezoneOffset()));

    expect(offsets.size).toBeGreaterThan(1);
  });

  it('keeps picker bounds identical in any browser timezone', () => {
    for (const bounds of inEveryTimeZone(() =>
      getInsertAtDatePickerBounds({ nextAvailableDate: day('2026-06-15') }, {}, day('2026-06-05')),
    )) {
      expect(bounds).toEqual({ minValue: '2026-06-06', maxValue: '2026-06-15' });
    }
  });

  it('describes the same server placement in any browser timezone', () => {
    for (const feedback of inEveryTimeZone(() => describeInsertAtDatePlacement(splitPlacement()))) {
      expect(feedback).toEqual({
        startText: 'Starts Tue, Jun 9',
        splitWarning: "Splits JOB-01042's 10-day slot into 4 + 6.",
      });
    }
  });

  it('round-trips local calendar date keys in any browser timezone', () => {
    // The local calendar bridge deliberately uses the browser-local day for Gantt
    // column geometry; the invariant is the round trip, not a fixed wall-clock day.
    for (const roundTripped of inEveryTimeZone(() => toJobCalendarDateKey(fromJobCalendarDateKey(day('2026-06-19'))))) {
      expect(roundTripped).toBe('2026-06-19');
    }
  });
});

function splitPlacement(): JobSchedulePreviewPlacement {
  return {
    afterDays: 6,
    beforeDays: 4,
    startDate: day('2026-06-09'),
    targetSlot: {
      bayId: '00000000-0000-4000-8000-000000000b01',
      createdAt: DateIso.parse('2026-06-05T08:00:00.000Z'),
      durationDays: 10,
      endDate: day('2026-06-19'),
      id: '00000000-0000-4000-8000-000000000001',
      jobCode: JobCode.parse('JOB-01042'),
      jobId: '00000000-0000-4000-8000-00000000aaaa',
      kind: 'work',
      label: null,
      sequence: 1,
      startDate: day('2026-06-05'),
      updatedAt: DateIso.parse('2026-06-05T08:00:00.000Z'),
    },
    type: 'split',
  };
}
