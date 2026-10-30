import type { DateOnlyIso } from '@pkg/schema';
import type { JobStatus } from '@pkg/schema/contracting';
import { formatDate, toPlantDateOnly } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { getFirstName } from '../formatting/text.js';
import { round1, suggestJobDates } from './hours.js';
import { hasJobCard } from './job-card.js';

export type StintHoursRefusal = { code: 'contracting_job.departure_before_arrival'; message: string };

/** "Departure hours must be at or above the arrival hours of 4 480.0 h." */
export const departureBeforeArrivalSentence = (arrival: number) =>
  `Departure hours must be at or above the arrival hours of ${formatHours(arrival)}.`;

/** The one rule on Job Hours. Equal is accepted: a Machine delivered and collected unused bills no Work hours. */
export function judgeStintHours(hours: {
  arrival: number;
  departure: number | null;
}): { ok: true } | { ok: false; refusal: StintHoursRefusal } {
  return hours.departure !== null && hours.departure < hours.arrival
    ? {
        ok: false,
        refusal: {
          code: 'contracting_job.departure_before_arrival',
          message: departureBeforeArrivalSentence(hours.arrival),
        },
      }
    : { ok: true };
}

export const HOURS_EDIT_REASON_REQUIRED = 'A reason is required once the Job is signed off.';

/** A reason is mandatory once the Job has a Job Card. */
export const hoursEditNeedsReason = (status: JobStatus) => hasJobCard(status);

/** Travel as the arrival snapshots it: the arrival less the Machine's last departure, clamped at zero. */
export function snapshotTravelHours(
  arrivalHours: number,
  previousDepartureHours: number | null,
): { travelHours: number; clamped: boolean } {
  if (previousDepartureHours === null) return { travelHours: 0, clamped: false };
  const difference = round1(arrivalHours - previousDepartureHours);
  return difference < 0 ? { travelHours: 0, clamped: true } : { travelHours: difference, clamped: false };
}

export const isOverTravelFlag = (travelHours: number, threshold: number) => travelHours > threshold;

export type TelematicsSnapshot = { hours: number; at: string };

/** How far a typed value sits from John Deere's last report; null for an unlinked Machine. */
export function johnDeereDifference(
  entered: number,
  telematics: TelematicsSnapshot | null,
  threshold: number,
): { hours: number; over: boolean } | null {
  if (!telematics) return null;
  const hours = round1(Math.abs(entered - telematics.hours));
  return { hours, over: hours > threshold };
}

/** "at 14:05 today" or "on 28 Oct 2026, 14:05". */
const reportedWhen = (at: string, now: Date) =>
  toPlantDateOnly(new Date(at)) === toPlantDateOnly(now)
    ? `at ${formatDate(at, 'time')} today`
    : `on ${formatDate(at, 'medium')}`;

/** The line under the hours input for a linked Machine: "John Deere read 4 512.0 h at 14:05 today." */
export const johnDeereLine = (telematics: TelematicsSnapshot, now: Date) =>
  `John Deere read ${formatHours(telematics.hours)} ${reportedWhen(telematics.at, now)}.`;

/** The warning over the threshold, which never stops the save. */
export const johnDeereDifferenceWarning = (difference: number, telematics: TelematicsSnapshot, now: Date) =>
  `That is ${formatHours(difference)} away from John Deere's last reading of ${formatHours(telematics.hours)} ${reportedWhen(telematics.at, now)}. Check the hours — you can still save.`;

/** Where a stint's Travel Hours came from: "set by Sipho", or "worked out at arrival". */
export const travelProvenance = ({ travelSetByName }: { travelSetByName: string | null }) =>
  travelSetByName ? `set by ${getFirstName(travelSetByName)}` : 'worked out at arrival';

export const TRAVEL_HOURS_EXPLANATION =
  'Travel Hours are worked out when the Machine arrives: its arrival hours less its last departure hours on any Job. Change them here if that is wrong; nothing recalculates them once you have.';

/**
 * The Job's dates as reports read them: stored when set, else from the first arrival's capture to the last departure's,
 * an open Job running to today. Null before anything arrived.
 */
export function effectiveJobDates(
  job: { startDate: DateOnlyIso | null; endDate: DateOnlyIso | null },
  stints: Parameters<typeof suggestJobDates>[0],
  today: DateOnlyIso,
): { startDate: DateOnlyIso; endDate: DateOnlyIso } | null {
  const suggested = suggestJobDates(stints);
  const startDate = job.startDate ?? suggested.startDate;
  if (!startDate) return null;
  const allLeft = stints.some((stint) => stint.arrival) && stints.every((stint) => !stint.arrival || stint.departure);
  const endDate = job.endDate ?? (allLeft ? suggested.endDate : null) ?? today;
  return { startDate, endDate: endDate < startDate ? startDate : endDate };
}
