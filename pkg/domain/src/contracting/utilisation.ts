import type { DateOnlyIso } from '@pkg/schema';
import type { DayCounts, HourKindTotals, ReportWindow } from '@pkg/schema/contracting';
import { JOHANNESBURG_TIME_ZONE, zonedDateStartToUtcInstant } from '../formatting/date.js';
import { addDateOnlyDays, diffDateOnlyDays } from '../formatting/date-only.js';
import { round1 } from './hours.js';
import { reportWindowInstants } from './report-window.js';

const earlier = (a: DateOnlyIso, b: DateOnlyIso) => (a <= b ? a : b);
const later = (a: DateOnlyIso, b: DateOnlyIso) => (a >= b ? a : b);

/** The days a Machine belongs to the fleet: from its creation date through its retirement date. */
export type FleetSpan = { createdDate: DateOnlyIso; retiredDate: DateOnlyIso | null };

/** A stint's Job's effective dates: the days the Machine counts as active on it. */
export type StintJobDates = { startDate: DateOnlyIso; endDate: DateOnlyIso };

/** What the day counts read off a Machine: its fleet span and its stints' Job dates. */
export type UtilisationMachine = FleetSpan & { stints: readonly StintJobDates[] };

/**
 * The window days the Machine belongs to the fleet, or null when it belongs to none of them. A window after today
 * resolves with `end < start`, so it holds no fleet days without a guard.
 */
function fleetBounds(fleet: FleetSpan, window: ReportWindow): { from: DateOnlyIso; to: DateOnlyIso } | null {
  const from = later(fleet.createdDate, window.start);
  const to = earlier(fleet.retiredDate ?? window.end, window.end);
  return to < from ? null : { from, to };
}

/**
 * Distinct window days covered by any stint's Job dates, inclusive on both ends. Days outside the
 * Machine's fleet span never count, so a Machine retired while on a Job, or a Job dated before its creation, cannot
 * have more active days than fleet days.
 */
function activeDaysIn(machine: UtilisationMachine, window: ReportWindow): number {
  const bounds = fleetBounds(machine, window);
  if (!bounds) return 0;
  const days = new Set<DateOnlyIso>();
  for (const stint of machine.stints) {
    const from = later(stint.startDate, bounds.from);
    const to = earlier(stint.endDate, bounds.to);
    for (let day = from; day <= to; day = addDateOnlyDays(day, 1)) days.add(day);
  }
  return days.size;
}

/** Window days from the Machine's creation date through its retirement date, or the window end. */
function fleetDaysIn(machine: FleetSpan, window: ReportWindow): number {
  const bounds = fleetBounds(machine, window);
  return bounds ? diffDateOnlyDays(bounds.to, bounds.from) + 1 : 0;
}

export const utilisationPercent = (activeDays: number, fleetDays: number): number | null =>
  fleetDays === 0 ? null : round1((activeDays / fleetDays) * 100);

/** One Machine's day counts for the window: zero fleet days when it was not in the fleet during it. */
export function dayCounts(machine: UtilisationMachine, window: ReportWindow): DayCounts {
  const activeDays = activeDaysIn(machine, window);
  const fleetDays = fleetDaysIn(machine, window);
  return { activeDays, fleetDays, utilisationPercent: utilisationPercent(activeDays, fleetDays) };
}

/** Day-weighted totals: the sums of the members' days, and the percentage of those sums, never a mean of percentages. */
export function sumDayCounts(rows: readonly DayCounts[]): DayCounts {
  const activeDays = rows.reduce((total, row) => total + row.activeDays, 0);
  const fleetDays = rows.reduce((total, row) => total + row.fleetDays, 0);
  return { activeDays, fleetDays, utilisationPercent: utilisationPercent(activeDays, fleetDays) };
}

export type HourKind = 'work' | 'travel';
/** One stretch of hours with a kind and the instants it ran between; `allocateHours` rounds each total once. */
export type HourSegment = { kind: HourKind; hours: number; from: string; to: string };

/** A Job's dates as instants: its Start date's plant midnight to the plant midnight after its End date. */
export const jobDatesInstants = (dates: { startDate: DateOnlyIso; endDate: DateOnlyIso }) => ({
  from: zonedDateStartToUtcInstant(dates.startDate, JOHANNESBURG_TIME_ZONE).toISOString(),
  to: zonedDateStartToUtcInstant(addDateOnlyDays(dates.endDate, 1), JOHANNESBURG_TIME_ZONE).toISOString(),
});

/** One stint's Work and Travel spread evenly over its Job's effective dates. */
export type DatedStintHours = StintJobDates & { workHours: number; travelHours: number };

/** A Machine's hour totals by kind for the window: each stint's Work and Travel over its Job's dates, then allocated. */
export function stintHourTotals(stints: readonly DatedStintHours[], window: ReportWindow): HourKindTotals {
  return allocateHours(
    stints.flatMap((stint) => {
      const span = jobDatesInstants(stint);
      return [
        { kind: 'work' as const, hours: stint.workHours, ...span },
        { kind: 'travel' as const, hours: stint.travelHours, ...span },
      ];
    }),
    window,
  );
}

/**
 * The share of a stretch of the meter, from `from` to `to` in epoch milliseconds, that falls in the range `[from, to)`:
 * its overlap over its length. A zero-length stretch is wholly in the range that holds its instant.
 */
export function overlapShare(from: number, to: number, range: { from: number; to: number }): number {
  const length = to - from;
  if (length <= 0) return from >= range.from && from < range.to ? 1 : 0;
  return Math.max(0, Math.min(to, range.to) - Math.max(from, range.from)) / length;
}

/**
 * Each segment's hours in proportion to its overlap with the window's plant-time instant range. A window after today
 * resolves with `end < start`, so its range is empty and every share is zero without a guard.
 */
export function allocateHours(segments: readonly HourSegment[], window: ReportWindow): HourKindTotals {
  const totals: Record<HourKind, number> = { work: 0, travel: 0 };
  const instants = reportWindowInstants(window);
  const range = { from: instants.from.getTime(), to: instants.to.getTime() };
  for (const segment of segments) {
    totals[segment.kind] += segment.hours * overlapShare(Date.parse(segment.from), Date.parse(segment.to), range);
  }
  return { workHours: round1(totals.work), travelHours: round1(totals.travel) };
}
