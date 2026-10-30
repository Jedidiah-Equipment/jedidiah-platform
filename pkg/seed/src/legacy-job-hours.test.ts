import { expect, test } from 'vitest';
import { foldLegacyJobHours } from './legacy-job-hours.js';

const reading = (id: string, role: string, value: number, at: string, extra: Record<string, unknown> = {}) => ({
  id,
  machineId: 'm1',
  sequence: Number(id.slice(1)),
  role,
  value,
  capturedAt: new Date(at),
  createdAt: new Date(at),
  capturedByUserId: 'u1',
  comment: null,
  amendedAt: null,
  amendedBy: null,
  amendmentReason: null,
  ...extra,
});

test('a pre-0185 snapshot folds its Job Hours onto the stints, Travel included, and keeps only spot readings', () => {
  const rows = new Map<string, Record<string, unknown>[]>([
    [
      'contracting_hour_reading',
      [
        reading('r1', 'spot', 90, '2026-10-01T08:00:00Z'),
        reading('r2', 'arrival', 100, '2026-10-02T08:00:00Z'),
        reading('r3', 'departure', 110, '2026-10-03T08:00:00Z', {
          amendedAt: new Date('2026-10-04T08:00:00Z'),
          amendedBy: 'u2',
          amendmentReason: 'Misread',
        }),
        reading('r4', 'arrival', 113.5, '2026-10-05T08:00:00Z', { comment: 'Gate' }),
      ],
    ],
    [
      'contracting_machine_assignment',
      [
        { id: 's1', arrivalReadingId: 'r2', departureReadingId: 'r3', travelIncluded: true, gapTravelHours: null },
        { id: 's2', arrivalReadingId: 'r4', departureReadingId: null, travelIncluded: true, gapTravelHours: null },
        { id: 's3', arrivalReadingId: null, departureReadingId: null, travelIncluded: true, gapTravelHours: null },
      ],
    ],
  ]);
  foldLegacyJobHours(rows);
  expect(rows.get('contracting_hour_reading')?.map((row) => row.id)).toEqual(['r1']);
  const [first, second, planned] = rows.get('contracting_machine_assignment') ?? [];
  expect(first).toMatchObject({
    arrivalHours: 100,
    departureHours: 110,
    departureAt: new Date('2026-10-03T08:00:00Z'),
    travelHours: 0,
    hoursAmendedByUserId: 'u2',
    hoursAmendmentReason: 'Misread',
  });
  expect(second).toMatchObject({ arrivalHours: 113.5, arrivalComment: 'Gate', departureHours: null, travelHours: 3.5 });
  expect(planned).toMatchObject({ arrivalHours: null, travelHours: null, travelSetAt: null });
});
