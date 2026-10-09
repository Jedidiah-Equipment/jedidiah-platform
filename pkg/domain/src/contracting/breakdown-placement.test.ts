import { describe, expect, test } from 'vitest';
import { breakdownPhases, breakdownsByStint, type PlacedStint } from './breakdown-placement.js';

const machineId = 'machine';
const implementId = 'implement';
const stint = (
  id: string,
  arrivedAt: string | null,
  departedAt: string | null = null,
  implement: string | null = null,
) =>
  ({
    id,
    machineId,
    implementId: implement,
    createdAt: '2026-10-01T06:00:00.000Z',
    arrival: arrivedAt ? { capturedAt: arrivedAt } : null,
    departure: departedAt ? { capturedAt: departedAt } : null,
  }) satisfies PlacedStint;
const breakdown = (reportedAt: string, kind: 'machine' | 'implement' = 'machine', id = machineId) => ({
  subject: { kind, id },
  reportedAt,
});

describe('breakdownsByStint', () => {
  test('goes to the stint on site when it was reported, not a later planned one', () => {
    const onSite = stint('on-site', '2026-10-02T08:00:00.000Z');
    const planned = stint('planned', null);
    const reported = breakdown('2026-10-02T10:00:00.000Z');
    expect(breakdownsByStint([planned, onSite], [reported]).get('on-site')).toEqual([reported]);
  });

  test('splits repeat stints by when each was on site, and follows the Implement', () => {
    const first = stint('first', '2026-10-02T06:00:00.000Z', '2026-10-03T06:00:00.000Z');
    const second = stint('second', '2026-10-05T06:00:00.000Z', null, implementId);
    const early = breakdown('2026-10-02T10:00:00.000Z');
    const afterLeaving = breakdown('2026-10-04T10:00:00.000Z');
    const late = breakdown('2026-10-06T10:00:00.000Z', 'implement', implementId);
    const placed = breakdownsByStint([second, first], [early, afterLeaving, late]);
    expect(placed.get('first')).toEqual([early, afterLeaving]);
    expect(placed.get('second')).toEqual([late]);
  });

  test('falls back to the earliest planned stint when reported before any arrival', () => {
    expect(breakdownsByStint([stint('only', null)], [breakdown('2026-09-30T10:00:00.000Z')]).get('only')).toHaveLength(
      1,
    );
  });
});

describe('breakdownPhases', () => {
  test('orders each Breakdown around the arrival and departure', () => {
    const phases = breakdownPhases(stint('s', '2026-10-02T08:00:00.000Z', '2026-10-02T17:00:00.000Z'), [
      breakdown('2026-10-02T18:00:00.000Z'),
      breakdown('2026-10-02T07:00:00.000Z'),
      breakdown('2026-10-02T12:00:00.000Z'),
    ]);
    expect(phases.beforeArrival.map((row) => row.reportedAt)).toEqual(['2026-10-02T07:00:00.000Z']);
    expect(phases.onSite.map((row) => row.reportedAt)).toEqual(['2026-10-02T12:00:00.000Z']);
    expect(phases.afterDeparture.map((row) => row.reportedAt)).toEqual(['2026-10-02T18:00:00.000Z']);
  });
});
