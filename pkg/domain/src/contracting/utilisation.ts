import type { DateOnlyIso } from '@pkg/schema';
import type { HourKindTotals, ReadingRole, ReportWindow } from '@pkg/schema/contracting';
import { addDateOnlyDays, diffDateOnlyDays } from '../formatting/date-only.js';
import { round1 } from './hours.js';
import { reportWindowInstants } from './report-window.js';

/** One Machine's stint as the day count sees it: plant dates of its readings, departure open while on site. */
export type ActiveSpan = { arrivalDate: DateOnlyIso; departureDate: DateOnlyIso | null };

const earlier = (a: DateOnlyIso, b: DateOnlyIso) => (a <= b ? a : b);
const later = (a: DateOnlyIso, b: DateOnlyIso) => (a >= b ? a : b);

/** The days a Machine belongs to the fleet: from its creation date through its retirement date. */
export type FleetSpan = { createdDate: DateOnlyIso; retiredDate: DateOnlyIso | null };

/** The window days the Machine belongs to the fleet, or null when it belongs to none of them. */
function fleetBounds(fleet: FleetSpan, window: ReportWindow): { from: DateOnlyIso; to: DateOnlyIso } | null {
  if (window.days === 0) return null;
  const from = later(fleet.createdDate, window.start);
  const to = earlier(fleet.retiredDate ?? window.end, window.end);
  return to < from ? null : { from, to };
}

/**
 * Distinct window days covered by any span, inclusive on both ends; `today` closes an open span. Days outside the
 * Machine's fleet span never count, so a Machine retired while on site, or a Read At back-dated before its creation,
 * cannot have more active days than fleet days.
 */
export function activeDaysIn(
  spans: readonly ActiveSpan[],
  window: ReportWindow,
  today: DateOnlyIso,
  fleet: FleetSpan,
): number {
  const bounds = fleetBounds(fleet, window);
  if (!bounds) return 0;
  const days = new Set<DateOnlyIso>();
  for (const span of spans) {
    const from = later(span.arrivalDate, bounds.from);
    const to = earlier(span.departureDate ?? today, bounds.to);
    for (let day = from; day <= to; day = addDateOnlyDays(day, 1)) days.add(day);
  }
  return days.size;
}

/** Window days from the Machine's creation date through its retirement date, or the window end. */
export function fleetDaysIn(machine: FleetSpan, window: ReportWindow): number {
  const bounds = fleetBounds(machine, window);
  return bounds ? diffDateOnlyDays(bounds.to, bounds.from) + 1 : 0;
}

export const utilisationPercent = (activeDays: number, fleetDays: number): number | null =>
  fleetDays === 0 ? null : round1((activeDays / fleetDays) * 100);

export type LedgerReading = { id: string; role: ReadingRole; value: number; capturedAt: string };
export type LedgerStint = {
  arrivalReadingId: string;
  departureReadingId: string | null;
  gap: { travelHours: number; unaccountedHours: number } | null;
};
export type HourKind = 'work' | 'travel' | 'unaccounted' | 'unresolved';
/**
 * One stretch of the meter with a kind and the instants it ran between. A gap run's share is kept unrounded so a
 * resolved split survives many small runs; `allocateHours` rounds each total once.
 */
export type HourSegment = { kind: HourKind; hours: number; from: string; to: string };

type GapRun = { from: string; to: string; hours: number };

/** Splits a closed Hour Gap over its runs by each run's share of the gap's hours, unrounded. */
function splitGapRuns(runs: readonly GapRun[], closing: LedgerStint, gapFlagThresholdHours: number): HourSegment[] {
  const gapHours = round1(runs.reduce((sum, run) => sum + run.hours, 0));
  const split: Record<Exclude<HourKind, 'work'>, number> = closing.gap !== null
    ? { travel: closing.gap.travelHours, unaccounted: closing.gap.unaccountedHours, unresolved: 0 }
    : gapHours > gapFlagThresholdHours
      ? { travel: 0, unaccounted: 0, unresolved: gapHours }
      : { travel: gapHours, unaccounted: 0, unresolved: 0 };
  return runs.flatMap((run) => {
    const share = gapHours === 0 ? 0 : run.hours / gapHours;
    return (['travel', 'unaccounted', 'unresolved'] as const).flatMap((kind) =>
      split[kind] > 0 ? [{ kind, hours: split[kind] * share, from: run.from, to: run.to }] : [],
    );
  });
}

/**
 * The ledger walk: a Machine's whole reading ledger in `sequence` order, phases switched by the stints' arrival and
 * departure reading ids (never by role). Before the first arrival and in a gap no arrival has closed count nowhere.
 */
export function hourSegments(
  readings: readonly LedgerReading[],
  stints: readonly LedgerStint[],
  gapFlagThresholdHours: number,
): HourSegment[] {
  const arrivals = new Map(stints.map((stint) => [stint.arrivalReadingId, stint]));
  const departures = new Set(stints.flatMap((stint) => (stint.departureReadingId ? [stint.departureReadingId] : [])));
  const segments: HourSegment[] = [];
  let gapRuns: GapRun[] = [];
  // A first arrival can open the ledger itself, with no baseline before it.
  const first = readings[0];
  let phase: 'before' | 'on-site' | 'gap' = !first
    ? 'before'
    : arrivals.has(first.id)
      ? 'on-site'
      : departures.has(first.id)
        ? 'gap'
        : 'before';
  for (let index = 1; index < readings.length; index += 1) {
    const previous = readings[index - 1];
    const next = readings[index];
    if (!previous || !next) continue;
    // A disputed pair may deliberately run backwards; it contributes nothing.
    const hours = Math.max(0, round1(next.value - previous.value));
    if (phase === 'on-site') segments.push({ kind: 'work', hours, from: previous.capturedAt, to: next.capturedAt });
    if (phase === 'gap') gapRuns.push({ from: previous.capturedAt, to: next.capturedAt, hours });
    const closing = arrivals.get(next.id);
    if (closing) {
      if (phase === 'gap') segments.push(...splitGapRuns(gapRuns, closing, gapFlagThresholdHours));
      gapRuns = [];
      phase = 'on-site';
    } else if (departures.has(next.id)) {
      phase = 'gap';
    }
  }
  return segments;
}

/** Each segment's hours in proportion to its overlap with the window's plant-time instant range. */
export function allocateHours(segments: readonly HourSegment[], window: ReportWindow): HourKindTotals {
  const totals: Record<HourKind, number> = { work: 0, travel: 0, unaccounted: 0, unresolved: 0 };
  if (window.days > 0) {
    const instants = reportWindowInstants(window);
    const range = { from: instants.from.getTime(), to: instants.to.getTime() };
    for (const segment of segments) {
      const from = Date.parse(segment.from);
      const to = Date.parse(segment.to);
      const length = to - from;
      const share =
        length <= 0
          ? from >= range.from && from < range.to
            ? 1
            : 0
          : Math.max(0, Math.min(to, range.to) - Math.max(from, range.from)) / length;
      totals[segment.kind] += segment.hours * share;
    }
  }
  return {
    workHours: round1(totals.work),
    travelHours: round1(totals.travel),
    unaccountedHours: round1(totals.unaccounted),
    unresolvedHours: round1(totals.unresolved),
  };
}
