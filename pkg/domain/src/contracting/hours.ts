import type { AssignmentState } from '@pkg/schema/contracting';
import { toPlantDateOnly } from '../formatting/date.js';
import { countPhrase } from './count-phrase.js';

export const GAP_FLAG_THRESHOLD_HOURS = 4;

export type StintReadings = {
  arrival: { value: number; capturedAt: string } | null;
  departure: { value: number; capturedAt: string } | null;
  previousDeparture: { value: number } | null;
  travelIncluded: boolean;
  gap: { travelHours: number; unaccountedHours: number } | null;
};

export type StintHours = {
  state: AssignmentState;
  workHours: number | null;
  gapHours: number | null;
  travelHours: number;
  unaccountedHours: number;
  gapFlag: boolean;
  billableHours: number | null;
};

export const round1 = (value: number) => Math.round(value * 10) / 10;

function nonnegativeDifference(later: number, earlier: number) {
  const difference = round1(later - earlier);
  return difference < 0 ? null : difference;
}

const stateOf = (arrived: boolean, left: boolean): AssignmentState =>
  !arrived ? 'planned' : left ? 'left' : 'on-site';

export const assignmentState = (stint: {
  arrivalReadingId: string | null;
  departureReadingId: string | null;
}): AssignmentState => stateOf(stint.arrivalReadingId !== null, stint.departureReadingId !== null);

export function deriveStintHours(stint: StintReadings, threshold = GAP_FLAG_THRESHOLD_HOURS): StintHours {
  const state = stateOf(stint.arrival !== null, stint.departure !== null);
  // A disputed reading may deliberately move the ledger backwards. Keep the Job readable while the
  // evidence is reviewed, but do not present a negative duration as meaningful operational hours.
  const workHours =
    stint.arrival && stint.departure ? nonnegativeDifference(stint.departure.value, stint.arrival.value) : null;
  const gapHours =
    stint.arrival && stint.previousDeparture
      ? nonnegativeDifference(stint.arrival.value, stint.previousDeparture.value)
      : null;
  const travelHours = stint.gap ? stint.gap.travelHours : stint.travelIncluded && gapHours !== null ? gapHours : 0;
  const unaccountedHours = stint.gap?.unaccountedHours ?? 0;
  return {
    state,
    workHours,
    gapHours,
    travelHours,
    unaccountedHours,
    gapFlag: gapHours !== null && gapHours > threshold && stint.gap === null,
    billableHours: workHours === null ? null : round1(workHours + travelHours),
  };
}

export function suggestJobDates(
  stints: readonly { arrival: { capturedAt: string } | null; departure: { capturedAt: string } | null }[],
): { startDate: string | null; endDate: string | null } {
  const arrivals = stints.flatMap((stint) => (stint.arrival ? [Date.parse(stint.arrival.capturedAt)] : []));
  const departures = stints.flatMap((stint) => (stint.departure ? [Date.parse(stint.departure.capturedAt)] : []));
  return {
    startDate: arrivals.length ? toPlantDateOnly(new Date(Math.min(...arrivals))) : null,
    endDate: departures.length ? toPlantDateOnly(new Date(Math.max(...departures))) : null,
  };
}

export type CompletionGate = { ok: true } | { ok: false; onSite: number; openGapFlags: number };

export function canComplete(stints: readonly StintHours[]): CompletionGate {
  const onSite = stints.filter((stint) => stint.state === 'on-site').length;
  const openGapFlags = stints.filter((stint) => stint.gapFlag).length;
  return onSite || openGapFlags ? { ok: false, onSite, openGapFlags } : { ok: true };
}

/** Why a Job cannot be completed yet, one sentence per unmet condition. */
export function completionGateReasons(gate: CompletionGate): string[] {
  if (gate.ok) return [];
  return [
    ...(gate.onSite ? [`${countPhrase(gate.onSite, 'machine is', 'machines are')} still on site.`] : []),
    ...(gate.openGapFlags ? [`${countPhrase(gate.openGapFlags, 'Gap Flag is', 'Gap Flags are')} open.`] : []),
  ];
}

export type GapSplit = { travelHours: number; unaccountedHours: number };

/** A resolved Hour Gap is wholly Travel Hours and Unaccounted Interval. */
export const gapSplitTotals = (gapHours: number, split: GapSplit): boolean =>
  round1(split.travelHours + split.unaccountedHours) === gapHours;

/** The split that gives `travel` hours to Travel Hours, clamped to the gap, and the rest to the Unaccounted Interval. */
export function splitGap(gapHours: number, travel: number): GapSplit {
  const travelHours = round1(Math.max(0, Math.min(gapHours, travel)));
  return { travelHours, unaccountedHours: round1(Math.max(0, gapHours - travelHours)) };
}
