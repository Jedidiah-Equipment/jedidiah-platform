import type { DateOnlyIso } from '@pkg/schema';
import { type DailyHoursDay, defaultHoursHeatMapMonths } from '@pkg/schema/contracting';
import { JOHANNESBURG_TIME_ZONE, zonedDateStartToUtcInstant } from '../formatting/date.js';
import { addDateOnlyDays, addDateOnlyMonths, diffDateOnlyDays } from '../formatting/date-only.js';
import { round1 } from './hours.js';
import { type LedgerReading, overlapShare } from './utilisation.js';

/** One stretch of the meter between two consecutive readings, with the instants it ran between. */
export type MeterSegment = { hours: number; from: string; to: string };

/** A stint as the instants of its arrival and departure readings; the departure is open while the Machine is on site. */
export type DailyHoursStint = { arrivalAt: string; departureAt: string | null };

/**
 * Every stretch the meter advanced between consecutive readings of one Machine's ledger (Read At order), whatever the
 * phase. A disputed pair may deliberately run backwards; it contributes nothing.
 */
export function meterSegments(readings: readonly Pick<LedgerReading, 'value' | 'capturedAt'>[]): MeterSegment[] {
  return readings.flatMap((next, index) => {
    const previous = readings[index - 1];
    if (!previous) return [];
    return [
      { hours: Math.max(0, round1(next.value - previous.value)), from: previous.capturedAt, to: next.capturedAt },
    ];
  });
}

/** The segments that lie wholly inside one of the stints: a Job's Work hours. */
export function segmentsWithinStints(
  segments: readonly MeterSegment[],
  stints: readonly DailyHoursStint[],
): MeterSegment[] {
  const bounds = stints.map((stint) => ({
    from: Date.parse(stint.arrivalAt),
    to: stint.departureAt === null ? Number.POSITIVE_INFINITY : Date.parse(stint.departureAt),
  }));
  return segments.filter((segment) => {
    const from = Date.parse(segment.from);
    const to = Date.parse(segment.to);
    return bounds.some((stint) => from >= stint.from && to <= stint.to);
  });
}

/** Index of the last boundary at or before `instant`, or -1 when it precedes them all. */
function lastBoundaryAtOrBefore(boundaries: readonly number[], instant: number): number {
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((boundaries[middle] ?? 0) <= instant) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

/**
 * The segments' hours attributed to each plant day from `start` through `end`, by elapsed time: a segment's hours are
 * shared out over the days it ran across in proportion to the time it spent in each. A day is estimated when hours
 * came from a segment that ran across more than one plant day. Every day in the range is returned, oldest first.
 */
export function allocateDailyHours(
  segments: readonly MeterSegment[],
  start: DateOnlyIso,
  end: DateOnlyIso,
): DailyHoursDay[] {
  const count = end < start ? 0 : diffDateOnlyDays(end, start) + 1;
  const dates = Array.from({ length: count }, (_, index) => addDateOnlyDays(start, index));
  const boundaries = [...dates, addDateOnlyDays(end, 1)].map((date) =>
    zonedDateStartToUtcInstant(date, JOHANNESBURG_TIME_ZONE).getTime(),
  );
  const hours = new Array<number>(count).fill(0);
  const estimated = new Array<boolean>(count).fill(false);
  for (const segment of segments) {
    if (segment.hours <= 0 || count === 0) continue;
    const from = Date.parse(segment.from);
    const to = Date.parse(segment.to);
    const first = Math.max(0, lastBoundaryAtOrBefore(boundaries, from));
    const touched: number[] = [];
    for (let day = first; day < count && (boundaries[day] ?? 0) < Math.max(to, from + 1); day += 1) {
      const range = { from: boundaries[day] ?? 0, to: boundaries[day + 1] ?? 0 };
      const share = overlapShare(from, to, range);
      if (share <= 0) continue;
      hours[day] = (hours[day] ?? 0) + segment.hours * share;
      touched.push(day);
    }
    // A segment running in from before the range, or out past it, reached a day outside it as well.
    const crossesEdge =
      (from < (boundaries[0] ?? 0) && to > (boundaries[0] ?? 0)) ||
      (to > (boundaries[count] ?? 0) && from < (boundaries[count] ?? 0));
    if (touched.length > 1 || crossesEdge) for (const day of touched) estimated[day] = true;
  }
  return dates.map((date, index) => ({ date, hours: round1(hours[index] ?? 0), estimated: estimated[index] ?? false }));
}

/**
 * The inclusive range a heat map reads: `end` defaults to today and is capped at it, `start` to six calendar months
 * before `end`. The range may still run backwards or too long; the caller refuses it with `isValidHoursHeatMapRange`
 * from `@pkg/schema/contracting`.
 */
export function resolveHoursHeatMapRange(
  input: { start?: DateOnlyIso | undefined; end?: DateOnlyIso | undefined },
  today: DateOnlyIso,
): { start: DateOnlyIso; end: DateOnlyIso } {
  const end = input.end && input.end < today ? input.end : today;
  return { start: input.start ?? addDateOnlyMonths(end, -defaultHoursHeatMapMonths), end };
}

export const dailyHoursLevels = [0, 1, 2, 3, 4] as const;
export type DailyHoursLevel = (typeof dailyHoursLevels)[number];

/** The busiest day's hours, the scale every cell in the range is shaded against. */
export const busiestDailyHours = (days: readonly Pick<DailyHoursDay, 'hours'>[]) =>
  days.reduce((busiest, day) => Math.max(busiest, day.hours), 0);

/** Level 0 is exactly no hours; levels 1 to 4 are the quarters of the busiest day, so any hours at all shade a cell. */
export function dailyHoursLevel(hours: number, busiestHours: number): DailyHoursLevel {
  if (hours <= 0 || busiestHours <= 0) return 0;
  const share = hours / busiestHours;
  if (share <= 0.25) return 1;
  if (share <= 0.5) return 2;
  if (share <= 0.75) return 3;
  return 4;
}
