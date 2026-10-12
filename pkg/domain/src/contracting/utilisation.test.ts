import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { resolveReportWindow } from './report-window.js';
import {
  activeDaysIn,
  allocateHours,
  fleetDaysIn,
  type HourSegment,
  hourSegments,
  type LedgerReading,
  type LedgerStint,
  utilisationPercent,
} from './utilisation.js';

const today = '2026-10-12' as DateOnlyIso;
const june = resolveReportWindow({ kind: 'month', year: 2026, period: 6 }, today);
const july = resolveReportWindow({ kind: 'month', year: 2026, period: 7 }, today);
const threshold = 4;
const date = (value: string) => value as DateOnlyIso;

let nextId = 0;
const reading = (role: LedgerReading['role'], value: number, capturedAt: string): LedgerReading => {
  nextId += 1;
  return { id: `r${nextId}`, role, value, capturedAt: new Date(capturedAt).toISOString() };
};
const stint = (
  arrival: LedgerReading,
  departure: LedgerReading | null,
  gap: LedgerStint['gap'] = null,
): LedgerStint => ({
  arrivalReadingId: arrival.id,
  departureReadingId: departure?.id ?? null,
  gap,
});
const nonZero = (segments: HourSegment[]) =>
  segments.filter((segment) => segment.hours > 0).map(({ kind, hours }) => ({ kind, hours }));

describe('hourSegments and allocateHours', () => {
  // Scenario 2 of #1378: a 37.4 h gap resolved as 1.6 h travel and 35.8 h of yard time.
  const firstArrival = reading('arrival', 6204.4, '2026-06-01T06:00:00+02:00');
  const departure = reading('departure', 6204.4, '2026-06-01T08:00:00+02:00');
  const arrival = reading('arrival', 6241.8, '2026-06-05T10:00:00+02:00');
  const leaving = reading('departure', 6263.0, '2026-06-09T16:00:00+02:00');
  const readings = [firstArrival, departure, arrival, leaving];

  test('a resolved gap carries its stored split and the stint after it is work', () => {
    const segments = hourSegments(
      readings,
      [stint(firstArrival, departure), stint(arrival, leaving, { travelHours: 1.6, unaccountedHours: 35.8 })],
      threshold,
    );
    expect(nonZero(segments)).toEqual([
      { kind: 'travel', hours: 1.6 },
      { kind: 'unaccounted', hours: 35.8 },
      { kind: 'work', hours: 21.2 },
    ]);
    expect(allocateHours(segments, june)).toEqual({
      workHours: 21.2,
      travelHours: 1.6,
      unaccountedHours: 35.8,
      unresolvedHours: 0,
    });
  });

  test('the same gap unresolved and over the threshold is all Unresolved', () => {
    const segments = hourSegments(readings, [stint(firstArrival, departure), stint(arrival, leaving)], threshold);
    expect(allocateHours(segments, june)).toEqual({
      workHours: 21.2,
      travelHours: 0,
      unaccountedHours: 0,
      unresolvedHours: 37.4,
    });
  });

  test('an unresolved gap under the threshold is all travel; the function never sees the travel toggle', () => {
    const a = reading('arrival', 100, '2026-06-01T08:00:00+02:00');
    const d = reading('departure', 110, '2026-06-02T08:00:00+02:00');
    const b = reading('arrival', 112.1, '2026-06-02T12:00:00+02:00');
    expect(nonZero(hourSegments([a, d, b], [stint(a, d), stint(b, null)], threshold))).toEqual([
      { kind: 'work', hours: 10 },
      { kind: 'travel', hours: 2.1 },
    ]);
  });

  test('pro-rates a segment across the month boundary by elapsed plant time, through a spot reading', () => {
    const a = reading('arrival', 4002.6, '2026-06-28T09:00:00+02:00');
    const spot = reading('spot', 4030.0, '2026-06-30T18:00:00+02:00');
    const d = reading('departure', 4051.2, '2026-07-03T12:00:00+02:00');
    const segments = hourSegments([a, spot, d], [stint(a, d)], threshold);
    // 27.4 h whole, plus 6 of the 66 hours from 30 Jun 18:00 to 3 Jul 12:00 of the next 21.2 h.
    expect(allocateHours(segments, june).workHours).toBe(29.3);
    expect(allocateHours(segments, july).workHours).toBe(19.3);
  });

  test('spreads a resolved split over yard spot readings by each run’s share of the gap', () => {
    const a = reading('arrival', 0, '2026-06-01T08:00:00+02:00');
    const d = reading('departure', 10, '2026-06-02T08:00:00+02:00');
    const yard1 = reading('spot', 13, '2026-06-03T08:00:00+02:00');
    const yard2 = reading('spot', 19, '2026-06-04T08:00:00+02:00');
    const b = reading('arrival', 25, '2026-06-05T08:00:00+02:00');
    const segments = hourSegments(
      [a, d, yard1, yard2, b],
      [stint(a, d), stint(b, null, { travelHours: 10, unaccountedHours: 5 })],
      threshold,
    );
    // Runs of 3, 6 and 6 hours: one fifth, two fifths, two fifths of the gap.
    expect(nonZero(segments)).toEqual([
      { kind: 'work', hours: 10 },
      { kind: 'travel', hours: 2 },
      { kind: 'unaccounted', hours: 1 },
      { kind: 'travel', hours: 4 },
      { kind: 'unaccounted', hours: 2 },
      { kind: 'travel', hours: 4 },
      { kind: 'unaccounted', hours: 2 },
    ]);
  });

  test('a disputed pair running backwards counts zero and changes no phase', () => {
    const a = reading('arrival', 500, '2026-06-01T08:00:00+02:00');
    const wrong = reading('spot', 480, '2026-06-02T08:00:00+02:00');
    const d = reading('departure', 490, '2026-06-03T08:00:00+02:00');
    expect(nonZero(hourSegments([a, wrong, d], [stint(a, d)], threshold))).toEqual([{ kind: 'work', hours: 10 }]);
  });

  test('counts nothing before the first arrival, after the last reading, or in a gap no arrival has closed', () => {
    const baseline = reading('baseline', 50, '2026-06-01T08:00:00+02:00');
    const a = reading('arrival', 60, '2026-06-02T08:00:00+02:00');
    const spot = reading('spot', 64, '2026-06-03T08:00:00+02:00');
    expect(nonZero(hourSegments([baseline, a, spot], [stint(a, null)], threshold))).toEqual([
      { kind: 'work', hours: 4 },
    ]);
    const d = reading('departure', 70, '2026-06-04T08:00:00+02:00');
    const yard = reading('spot', 75, '2026-06-05T08:00:00+02:00');
    expect(nonZero(hourSegments([baseline, a, d, yard], [stint(a, d)], threshold))).toEqual([
      { kind: 'work', hours: 10 },
    ]);
  });
});

describe('activeDaysIn and fleetDaysIn', () => {
  test('counts distinct window days inclusive of arrival and departure, and an open stint through today', () => {
    expect(activeDaysIn([{ arrivalDate: date('2026-06-28'), departureDate: date('2026-07-03') }], june, today)).toBe(3);
    expect(
      activeDaysIn(
        [
          { arrivalDate: date('2026-06-01'), departureDate: date('2026-06-05') },
          { arrivalDate: date('2026-06-05'), departureDate: date('2026-06-06') },
        ],
        june,
        today,
      ),
    ).toBe(6);
    const october = resolveReportWindow({ kind: 'month', year: 2026, period: 10 }, today);
    expect(activeDaysIn([{ arrivalDate: date('2026-10-10'), departureDate: null }], october, today)).toBe(3);
    expect(activeDaysIn([], june, today)).toBe(0);
  });

  test('counts window days from creation through retirement or the window end', () => {
    expect(fleetDaysIn({ createdDate: date('2026-06-15'), retiredDate: null }, june)).toBe(16);
    expect(fleetDaysIn({ createdDate: date('2026-01-01'), retiredDate: date('2026-06-10') }, june)).toBe(10);
    expect(fleetDaysIn({ createdDate: date('2026-07-01'), retiredDate: null }, june)).toBe(0);
    expect(fleetDaysIn({ createdDate: date('2026-01-01'), retiredDate: date('2026-05-31') }, june)).toBe(0);
  });

  test('utilisation is one decimal of active over fleet days, and null without fleet days', () => {
    expect(utilisationPercent(10, 30)).toBe(33.3);
    expect(utilisationPercent(0, 0)).toBeNull();
  });
});
