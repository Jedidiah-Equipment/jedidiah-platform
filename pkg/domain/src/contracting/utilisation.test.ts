import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { resolveReportWindow } from './report-window.js';
import {
  allocateHours,
  dayCounts,
  type HourSegment,
  hourSegments,
  type LedgerReading,
  type LedgerStint,
  sumDayCounts,
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
  segments
    .filter((segment) => segment.hours > 0)
    .map(({ kind, hours }) => ({ kind, hours: Math.round(hours * 10) / 10 }));

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

  test('a small resolved split over many runs keeps its stored totals', () => {
    const a = reading('arrival', 0, '2026-06-01T08:00:00+02:00');
    const d = reading('departure', 1, '2026-06-01T09:00:00+02:00');
    const yard1 = reading('spot', 1.1, '2026-06-01T10:00:00+02:00');
    const yard2 = reading('spot', 1.2, '2026-06-01T11:00:00+02:00');
    const b = reading('arrival', 1.3, '2026-06-01T12:00:00+02:00');
    const segments = hourSegments(
      [a, d, yard1, yard2, b],
      [stint(a, d), stint(b, null, { travelHours: 0.1, unaccountedHours: 0.2 })],
      threshold,
    );
    expect(allocateHours(segments, june)).toMatchObject({ travelHours: 0.1, unaccountedHours: 0.2 });
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

const always = { createdDate: date('2020-01-01'), retiredDate: null };
const october = resolveReportWindow({ kind: 'month', year: 2026, period: 10 }, today);

describe('dayCounts', () => {
  test('counts distinct window days inclusive of arrival and departure, and an open stint through today', () => {
    const spans = (...pairs: [string, string | null][]) =>
      pairs.map(([arrival, departure]) => ({
        arrivalDate: date(arrival),
        departureDate: departure === null ? null : date(departure),
      }));
    expect(dayCounts({ ...always, spans: spans(['2026-06-28', '2026-07-03']) }, june, today).activeDays).toBe(3);
    expect(
      dayCounts({ ...always, spans: spans(['2026-06-01', '2026-06-05'], ['2026-06-05', '2026-06-06']) }, june, today),
    ).toEqual({ activeDays: 6, fleetDays: 30, utilisationPercent: 20 });
    expect(dayCounts({ ...always, spans: spans(['2026-10-10', null]) }, october, today).activeDays).toBe(3);
    expect(dayCounts({ ...always, spans: [] }, june, today)).toEqual({
      activeDays: 0,
      fleetDays: 30,
      utilisationPercent: 0,
    });
  });

  test('never counts an active day outside the Machine’s fleet days', () => {
    // Retired on 5 Oct while still on site since 1 Oct: 5 fleet days, so at most 5 active days, never 240%.
    const retired = { createdDate: date('2020-01-01'), retiredDate: date('2026-10-05') };
    const onSite = [{ arrivalDate: date('2026-10-01'), departureDate: null }];
    expect(dayCounts({ ...retired, spans: onSite }, october, today)).toEqual({
      activeDays: 5,
      fleetDays: 5,
      utilisationPercent: 100,
    });
    // A Read At back-dated before the Machine joined counts only from its creation date.
    const joined = { createdDate: date('2026-06-10'), retiredDate: null };
    const early = [{ arrivalDate: date('2026-06-05'), departureDate: date('2026-06-12') }];
    expect(dayCounts({ ...joined, spans: early }, june, today).activeDays).toBe(3);
  });

  test('counts fleet days from creation through retirement or the window end', () => {
    const fleetDays = (createdDate: string, retiredDate: string | null) =>
      dayCounts(
        { createdDate: date(createdDate), retiredDate: retiredDate === null ? null : date(retiredDate), spans: [] },
        june,
        today,
      ).fleetDays;
    expect(fleetDays('2026-06-15', null)).toBe(16);
    expect(fleetDays('2026-01-01', '2026-06-10')).toBe(10);
    expect(fleetDays('2026-07-01', null)).toBe(0);
    expect(fleetDays('2026-01-01', '2026-05-31')).toBe(0);
  });

  test('a window after today holds no days and no hours, without a guard', () => {
    const november = resolveReportWindow({ kind: 'month', year: 2026, period: 11 }, today);
    const onSite = [{ arrivalDate: date('2026-10-01'), departureDate: null }];
    expect(dayCounts({ ...always, spans: onSite }, november, today)).toEqual({
      activeDays: 0,
      fleetDays: 0,
      utilisationPercent: null,
    });
    const a = reading('arrival', 0, '2026-10-01T08:00:00+02:00');
    const spot = reading('spot', 10, '2026-10-02T08:00:00+02:00');
    expect(allocateHours(hourSegments([a, spot], [stint(a, null)], threshold), november)).toEqual({
      workHours: 0,
      travelHours: 0,
      unaccountedHours: 0,
      unresolvedHours: 0,
    });
  });

  test('utilisation is one decimal of active over fleet days, and null without fleet days', () => {
    expect(utilisationPercent(10, 30)).toBe(33.3);
    expect(utilisationPercent(0, 0)).toBeNull();
  });
});

describe('sumDayCounts', () => {
  test('sums days and takes the percentage of the sums, never a mean of percentages', () => {
    expect(
      sumDayCounts([
        { activeDays: 3, fleetDays: 30, utilisationPercent: 10 },
        { activeDays: 0, fleetDays: 10, utilisationPercent: 0 },
      ]),
    ).toEqual({ activeDays: 3, fleetDays: 40, utilisationPercent: 7.5 });
    expect(sumDayCounts([])).toEqual({ activeDays: 0, fleetDays: 0, utilisationPercent: null });
  });
});
