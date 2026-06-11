import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it, vi } from 'vitest';

import { formatDate, toPlantDateOnly } from '../formatting/date.js';
import { resolveInsertAtDatePlacement } from './job-slot-insert-at-date.js';
import { projectJobSlots } from './job-slot-projection.js';

const day = (value: string) => DateOnlyIso.parse(value);

// Scheduling dates are plant business dates (ADR-0043): every derived value must be
// identical regardless of the timezone the server or viewer happens to run in. These
// zones cover the plant itself, UTC, a negative offset with DST, and a far-positive
// offset — a regression that leaks the ambient timezone into scheduling fails here.
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

describe('scheduling timezone tripwire', () => {
  it('actually switches the process timezone (the tripwire is live)', () => {
    // If Node ever started caching the zone past env changes, every cross-zone
    // assertion above would degrade into testing one zone four times.
    const offsets = new Set(inEveryTimeZone(() => new Date('2026-06-09T12:00:00.000Z').getTimezoneOffset()));

    expect(offsets.size).toBeGreaterThan(1);
  });

  it('derives the plant business date from Africa/Johannesburg in any process timezone', () => {
    for (const plantDate of inEveryTimeZone(() => toPlantDateOnly(new Date('2026-06-18T21:59:59.000Z')))) {
      expect(plantDate).toBe('2026-06-18');
    }

    // 22:00 UTC is already the next day at the plant (UTC+2), wherever the process runs.
    for (const plantDate of inEveryTimeZone(() => toPlantDateOnly(new Date('2026-06-18T22:00:00.000Z')))) {
      expect(plantDate).toBe('2026-06-19');
    }
  });

  it('renders a date-only value as the same calendar date in any process timezone', () => {
    for (const rendered of inEveryTimeZone(() => formatDate('2026-06-09', 'MMM d'))) {
      expect(rendered).toBe('Jun 9');
    }
  });

  it('projects identical slot dates in any process timezone', () => {
    const projections = inEveryTimeZone(() =>
      projectJobSlots({
        scheduleOrigin: day('2026-06-05'),
        slots: [
          { durationDays: 2, id: 'slot-1', sequence: 1 },
          { durationDays: 3, id: 'slot-2', sequence: 2 },
        ],
        workingCalendar: { orgOffDays: new Set(['2026-06-06', '2026-06-07']) },
      }),
    );

    for (const projection of projections) {
      expect(projection).toEqual(projections[0]);
      expect(projection.nextAvailableDate).toBe('2026-06-12');
    }
  });

  it('resolves identical insert-at-date placements in any process timezone', () => {
    const placements = inEveryTimeZone(() =>
      resolveInsertAtDatePlacement({
        currentDate: day('2026-06-05'),
        pickedDate: day('2026-06-09'),
        scheduleOrigin: day('2026-06-05'),
        slots: [{ durationDays: 10, id: 'slot-1', sequence: 1 }],
      }),
    );

    for (const placement of placements) {
      expect(placement).toEqual(placements[0]);
      expect(placement).toMatchObject({ type: 'split', beforeDays: 4, afterDays: 6, startDate: '2026-06-09' });
    }
  });
});
