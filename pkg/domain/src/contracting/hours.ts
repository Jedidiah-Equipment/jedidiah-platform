import type { AssignmentState } from '@pkg/schema/contracting';
import { toPlantDateOnly } from '../formatting/date.js';

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

export function assignmentState({
  arrivalReadingId,
  departureReadingId,
}: {
  arrivalReadingId: string | null;
  departureReadingId: string | null;
}): AssignmentState {
  if (!arrivalReadingId) return 'planned';
  return departureReadingId ? 'left' : 'on-site';
}

export function deriveStintHours(stint: StintReadings, threshold = GAP_FLAG_THRESHOLD_HOURS): StintHours {
  const state: AssignmentState = !stint.arrival ? 'planned' : stint.departure ? 'left' : 'on-site';
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

export function suggestJobDates(stints: readonly StintReadings[]): {
  startDate: string | null;
  endDate: string | null;
} {
  const arrivals = stints.flatMap((stint) => (stint.arrival ? [Date.parse(stint.arrival.capturedAt)] : []));
  const departures = stints.flatMap((stint) => (stint.departure ? [Date.parse(stint.departure.capturedAt)] : []));
  return {
    startDate: arrivals.length ? toPlantDateOnly(new Date(Math.min(...arrivals))) : null,
    endDate: departures.length ? toPlantDateOnly(new Date(Math.max(...departures))) : null,
  };
}

export function canComplete(
  stints: readonly StintHours[],
): { ok: true } | { ok: false; onSite: number; openGapFlags: number } {
  const onSite = stints.filter((stint) => stint.state === 'on-site').length;
  const openGapFlags = stints.filter((stint) => stint.gapFlag).length;
  return onSite || openGapFlags ? { ok: false, onSite, openGapFlags } : { ok: true };
}
