import type { DateOnlyIso } from '@pkg/schema';
import type { HourKindTotals, ReadingRole, ReportWindow } from '@pkg/schema/contracting';
import { JOHANNESBURG_TIME_ZONE, zonedDateStartToUtcInstant } from '../formatting/date.js';
import { addDateOnlyDays, diffDateOnlyDays } from '../formatting/date-only.js';
import { round1 } from './hours.js';

/** One Machine's stint as the day count sees it: plant dates of its readings, departure open while on site. */
export type ActiveSpan = { arrivalDate: DateOnlyIso; departureDate: DateOnlyIso | null };

const earlier = (a: DateOnlyIso, b: DateOnlyIso) => (a <= b ? a : b);
const later = (a: DateOnlyIso, b: DateOnlyIso) => (a >= b ? a : b);

/** Distinct window days covered by any span; `today` closes an open span. Inclusive on both ends. */
export function activeDaysIn(spans: readonly ActiveSpan[], window: ReportWindow, today: DateOnlyIso): number {
  if (window.days === 0) return 0;
  const days = new Set<DateOnlyIso>();
  for (const span of spans) {
    const from = later(span.arrivalDate, window.start);
    const to = earlier(span.departureDate ?? today, window.end);
    for (let day = from; day <= to; day = addDateOnlyDays(day, 1)) days.add(day);
  }
  return days.size;
}

/** Window days from the Machine's creation date through its retirement date, or the window end. */
export function fleetDaysIn(
  machine: { createdDate: DateOnlyIso; retiredDate: DateOnlyIso | null },
  window: ReportWindow,
): number {
  if (window.days === 0) return 0;
  const from = later(machine.createdDate, window.start);
  const to = earlier(machine.retiredDate ?? window.end, window.end);
  return to < from ? 0 : diffDateOnlyDays(to, from) + 1;
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
/** One stretch of the meter with a kind and the instants it ran between; `hours` is one decimal. */
export type HourSegment = { kind: HourKind; hours: number; from: string; to: string };

type GapRun = { from: string; to: string; hours: number };

/** Splits a closed Hour Gap over its runs by each run's share of the gap's hours. */
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
      split[kind] > 0 ? [{ kind, hours: round1(split[kind] * share), from: run.from, to: run.to }] : [],
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

/** The window's plant-time instant range: its first day's midnight up to the midnight after its last day. */
function windowInstants(window: ReportWindow) {
  return {
    from: zonedDateStartToUtcInstant(window.start, JOHANNESBURG_TIME_ZONE).getTime(),
    to: zonedDateStartToUtcInstant(addDateOnlyDays(window.end, 1), JOHANNESBURG_TIME_ZONE).getTime(),
  };
}

/** Each segment's hours in proportion to its overlap with the window's plant-time instant range. */
export function allocateHours(segments: readonly HourSegment[], window: ReportWindow): HourKindTotals {
  const totals: Record<HourKind, number> = { work: 0, travel: 0, unaccounted: 0, unresolved: 0 };
  if (window.days > 0) {
    const range = windowInstants(window);
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
