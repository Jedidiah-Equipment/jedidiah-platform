import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { resolveReportWindow } from './report-window.js';
import { dayCounts, stintHourTotals, sumDayCounts, utilisationPercent } from './utilisation.js';

const today = '2026-10-12' as DateOnlyIso;
const june = resolveReportWindow({ kind: 'month', year: 2026, period: 6 }, today);
const july = resolveReportWindow({ kind: 'month', year: 2026, period: 7 }, today);
const date = (value: string) => value as DateOnlyIso;

describe('stintHourTotals', () => {
  test('a stint inside the window counts its Work and Travel whole', () => {
    const stint = { workHours: 21.2, travelHours: 1.6, startDate: date('2026-06-01'), endDate: date('2026-06-09') };
    expect(stintHourTotals([stint], june)).toEqual({ workHours: 21.2, travelHours: 1.6 });
  });

  test('pro-rates a Job across the month boundary by its days in each month', () => {
    // 28 Jun through 3 Jul: three days in June, three in July.
    const stint = { workHours: 48.6, travelHours: 3, startDate: date('2026-06-28'), endDate: date('2026-07-03') };
    expect(stintHourTotals([stint], june)).toEqual({ workHours: 24.3, travelHours: 1.5 });
    expect(stintHourTotals([stint], july)).toEqual({ workHours: 24.3, travelHours: 1.5 });
  });
});

const always = { createdDate: date('2020-01-01'), retiredDate: null };
const october = resolveReportWindow({ kind: 'month', year: 2026, period: 10 }, today);

describe('dayCounts', () => {
  test("counts distinct window days inside the Jobs' dates, inclusive of both ends", () => {
    const stints = (...pairs: [string, string][]) =>
      pairs.map(([start, end]) => ({ startDate: date(start), endDate: date(end) }));
    expect(dayCounts({ ...always, stints: stints(['2026-06-28', '2026-07-03']) }, june).activeDays).toBe(3);
    expect(
      dayCounts({ ...always, stints: stints(['2026-06-01', '2026-06-05'], ['2026-06-05', '2026-06-06']) }, june),
    ).toEqual({ activeDays: 6, fleetDays: 30, utilisationPercent: 20 });
    expect(dayCounts({ ...always, stints: stints(['2026-10-10', '2026-10-12']) }, october).activeDays).toBe(3);
    expect(dayCounts({ ...always, stints: [] }, june)).toEqual({
      activeDays: 0,
      fleetDays: 30,
      utilisationPercent: 0,
    });
  });

  test('never counts an active day outside the Machine’s fleet days', () => {
    // Retired on 5 Oct while still on site since 1 Oct: 5 fleet days, so at most 5 active days, never 240%.
    const retired = { createdDate: date('2020-01-01'), retiredDate: date('2026-10-05') };
    const onSite = [{ startDate: date('2026-10-01'), endDate: today }];
    expect(dayCounts({ ...retired, stints: onSite }, october)).toEqual({
      activeDays: 5,
      fleetDays: 5,
      utilisationPercent: 100,
    });
    // A Job dated before the Machine joined counts only from its creation date.
    const joined = { createdDate: date('2026-06-10'), retiredDate: null };
    const early = [{ startDate: date('2026-06-05'), endDate: date('2026-06-12') }];
    expect(dayCounts({ ...joined, stints: early }, june).activeDays).toBe(3);
  });

  test('counts fleet days from creation through retirement or the window end', () => {
    const fleetDays = (createdDate: string, retiredDate: string | null) =>
      dayCounts(
        { createdDate: date(createdDate), retiredDate: retiredDate === null ? null : date(retiredDate), stints: [] },
        june,
      ).fleetDays;
    expect(fleetDays('2026-06-15', null)).toBe(16);
    expect(fleetDays('2026-01-01', '2026-06-10')).toBe(10);
    expect(fleetDays('2026-07-01', null)).toBe(0);
    expect(fleetDays('2026-01-01', '2026-05-31')).toBe(0);
  });

  test('a window after today holds no days and no hours, without a guard', () => {
    const november = resolveReportWindow({ kind: 'month', year: 2026, period: 11 }, today);
    const onSite = [{ startDate: date('2026-10-01'), endDate: today }];
    expect(dayCounts({ ...always, stints: onSite }, november)).toEqual({
      activeDays: 0,
      fleetDays: 0,
      utilisationPercent: null,
    });
    const stint = { workHours: 10, travelHours: 1, startDate: date('2026-10-01'), endDate: date('2026-10-12') };
    expect(stintHourTotals([stint], november)).toEqual({ workHours: 0, travelHours: 0 });
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
