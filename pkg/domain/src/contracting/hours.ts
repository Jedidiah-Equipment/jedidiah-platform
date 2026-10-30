import type { DateOnlyIso } from '@pkg/schema';
import type { AssignmentState } from '@pkg/schema/contracting';
import { countPhrase } from '../formatting/count-phrase.js';
import { toPlantDateOnly } from '../formatting/date.js';

export const round1 = (value: number) => Math.round(value * 10) / 10;

/** Hours as the dash shows them: tenths, truncated, never rounded up past what the meter has reached. */
export const floorToTenth = (value: number) => Math.floor(value * 10) / 10;

/** A stint's Job Hours and Travel Hours as the Machine Assignment row holds them. */
export type StintHourColumns = {
  arrivalHours: number | null;
  departureHours: number | null;
  travelHours: number | null;
};

export type StintHours = {
  state: AssignmentState;
  workHours: number | null;
  billableHours: number | null;
};

export const assignmentState = (stint: Pick<StintHourColumns, 'arrivalHours' | 'departureHours'>): AssignmentState =>
  stint.arrivalHours === null ? 'planned' : stint.departureHours === null ? 'on-site' : 'left';

/** Work is departure less arrival, never negative; billable is Work plus Travel. */
export function deriveStintHours(stint: StintHourColumns): StintHours {
  const state = assignmentState(stint);
  const workHours =
    stint.arrivalHours !== null && stint.departureHours !== null
      ? Math.max(0, round1(stint.departureHours - stint.arrivalHours))
      : null;
  return {
    state,
    workHours,
    billableHours: workHours === null ? null : round1(workHours + (stint.travelHours ?? 0)),
  };
}

/** When each of a Job's stints had its arrival and departure captured, as the server saved them. */
export type StintCaptureMoments = readonly { arrival: { at: string } | null; departure: { at: string } | null }[];

/** Start and End dates to confirm at Completion: the days the first arrival and the last departure were captured. */
export function suggestJobDates(stints: StintCaptureMoments): {
  startDate: DateOnlyIso | null;
  endDate: DateOnlyIso | null;
} {
  const arrivals = stints.flatMap((stint) => (stint.arrival ? [Date.parse(stint.arrival.at)] : []));
  const departures = stints.flatMap((stint) => (stint.departure ? [Date.parse(stint.departure.at)] : []));
  return {
    startDate: arrivals.length ? toPlantDateOnly(new Date(Math.min(...arrivals))) : null,
    endDate: departures.length ? toPlantDateOnly(new Date(Math.max(...departures))) : null,
  };
}

export type CompletionGate = { ok: true } | { ok: false; onSite: number };

/** The only Completion gate on hours: no Machine is still on site. */
export function canComplete(stints: readonly { state: AssignmentState }[]): CompletionGate {
  const onSite = stints.filter((stint) => stint.state === 'on-site').length;
  return onSite ? { ok: false, onSite } : { ok: true };
}

/** Why a Job cannot be completed yet: "2 machines are still on site." */
export function completionGateReasons(gate: CompletionGate): string[] {
  return gate.ok ? [] : [`${countPhrase(gate.onSite, 'machine is', 'machines are')} still on site.`];
}
